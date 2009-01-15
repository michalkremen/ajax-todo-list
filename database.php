<?php

/** @addtogroup arch */
/** @{ */

/** @file
 * Generic database interface.
 */

/** Generic database interface.
 */
class database extends PDO
{
  public $dbtype;

  /** Constructor. Create database connection and set some connection attributes.
   */
  public function __construct($dsn, $user = null, $pass = null)
  {
    $this->dbtype = explode(':', $dsn);
    $this->dbtype = $this->dbtype[0];
    $opts = array();
    //if ($this->dbtype == 'pgsql')
    //  $opts = DEBUG_ENABLED ? array() : array(PDO::ATTR_PERSISTENT => true);
    parent::__construct($dsn, $user, $pass, $opts);
    if ($this->dbtype == 'mysql')
    {
      $this->query("SET NAMES utf8");
      $this->query("SET sql_mode = 'ANSI'");
//      $this->query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    }
    $this->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  }

  /** Check if result has exactly one row.
   */
  private function fetch_one_row($result, $style)
  {
    $row = $result->fetch($style);
    if (!$row)
      throw new Exception("expecting single row, got none");
    $next_row = $result->fetch($style);
    if (!$next_row)
      return $row;
    throw new Exception("expecting single row, got more");
  }

  /** Make SQL query to that returns single row.
   */
  public function row_iquery()
  {
    $args = func_get_args();
    $res = call_user_func_array(array($this, "iquery"), $args);
    $row = $this->fetch_one_row($res, PDO::FETCH_BOTH);
    return $row;
  }

  /** Make SQL query to that returns first column from the first row.
   */
  public function col_iquery()
  {
    $args = func_get_args();
    $res = call_user_func_array(array($this, "iquery"), $args);
    $row = $this->fetch_one_row($res, PDO::FETCH_NUM);
    return $row[0];
  }

  public function table_exists($name)
  {
    return $GLOBALS['db']->col_iquery('SELECT COUNT(*) FROM pg_tables WHERE schemaname = ? AND tablename = ?', "public", $name) != 0;
  }

  /** Make intelligent SQL query.
   *
   * @param base_sql [string] SQL query string that may contain ? substitution parameter
   * @param  ... Substitution parameter values.
   * @return PDOStatement object.
   *
   * @par Code:
   * @code
   *  $db->iquery('INSERT INTO table(col1, col2) VALUES (?, ?)', (string)$col1, (int)$col2);
   *  $db->iquery('SELECT * FROM table WHERE col1 = ? AND col2 = ?', (string)$col1, (int)$col2);
   * @endcode
   */
  public function iquery($base_sql)
  {
    $args = func_get_args();
    $sql = array_shift($args);
    if (isset($args[0]) && is_array($args[0]))
      $args = $args[0];
    //X($sql."\n");
    $stmt = $this->prepare($sql);
    $stmt->execute($args);
    return $stmt;
  }

  /** Make SQL query.
   */
  public function query($sql)
  {
    //X($sql."\n\n");
    return parent::query($sql);
  }

  /** Backup data.
   * 
   * @param out_dbtype [string] Output for specified database type.
   */
  public function backup($out_dbtype = 'pgsql')
  {
    if ($out_dbtype == 'pgsql')
      echo "SET escape_string_warning = off;\n";

    if ($this->dbtype == 'pgsql')
      $tables = $this->query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'")->fetchAll(PDO::FETCH_NUM);
    else
      $tables = $this->query("SHOW TABLES")->fetchAll(PDO::FETCH_NUM);

    foreach ($tables as $table)
    {
      $name = $table[0];

      echo "\n-- TABLE: $name\n\n";

      // get table data
      if ($this->dbtype == 'mysql')
        $query = $this->query("SELECT * FROM `$name`");
      else
        $query = $this->query("SELECT * FROM $name");
      $column_count = $query->columnCount();

      // and metadata
      $column_names = array();
      $metas = array();
      for ($i = 0; $i < $column_count; $i++)
      {
        $metas[$i] = $meta = $query->getColumnMeta($i);
        if ($out_dbtype == 'mysql')
          $column_names[] = '`'.$meta['name'].'`';
        else
          $column_names[] = $meta['name'];
      }
      $column_names = implode(', ', $column_names);

      if ($out_dbtype == 'pgsql')
        echo "ALTER TABLE $name DISABLE TRIGGER ALL;\n\n";

      // create INSERTS
      while ($row = $query->fetch(PDO::FETCH_NUM))
      {
        $insert = "INSERT INTO $name ($column_names) VALUES (";
        for ($i = 0; $i < $column_count; $i++)
        {
          $mysql_int = isset($metas[$i]['native_type']) && $metas[$i]['native_type'] == 'LONG';
          $mysql_bool = !isset($metas[$i]['native_type']) && $metas[$i]['len'] == '1';
          $insert.= ($i ? ", " : "");
          if (is_null($row[$i]))
            $insert.= 'NULL';
          else if (is_integer($row[$i]) || $mysql_int)
            $insert.= $row[$i];
          else if (is_bool($row[$i]) || $mysql_bool)
            $insert.= $row[$i] ? 'TRUE' : 'FALSE';
          else
            $insert.= Q($row[$i]);
        }
        $insert.= ");\n";

        echo $insert;
      }

      if ($out_dbtype == 'pgsql')
        echo "\nALTER TABLE $name ENABLE TRIGGER ALL;\n";
    } 
  }
}

/** Quote SQL string.
 *
 * @param s [string] String to quote.
 *
 * @return [string]  Quoted string.
 */
function Q($s)
{
  return $GLOBALS['db']->quote($s);
}

/** @} */

?>
