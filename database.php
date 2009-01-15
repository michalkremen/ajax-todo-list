<?php

class database extends PDO
{
  public function __construct($path)
  {
    parent::__construct("sqlite:".$path);
    $this->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  }

  public function table_exists($name)
  {
    $data = $GLOBALS['db']->iquery('SELECT COUNT(*) FROM sqlite_master WHERE type = ? AND name = ?', "table", $name)->fetchAll();
    return $data[0][0] > 0;
  }

  public function iquery($base_sql)
  {
    $args = func_get_args();
    $sql = array_shift($args);
    if (isset($args[0]) && is_array($args[0]))
      $args = $args[0];
    $stmt = $this->prepare($sql);
    $stmt->execute($args);
    return $stmt;
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

?>
