<?php

require_once "database.php";
require_once "rpc-lib.php";
require_once "texy.compact.php";

function texy_process($texy_text)
{
  require_once "texy.compact.php";

  $texy = new Texy();
  $texy->allowed['emoticon'] = false;
  $texy->allowed['longwords'] = true;
  $texy->longWordsModule->wordLimit = 15;
  $texy->headingModule->moreMeansHigher = FALSE;
  $texy->headingModule->top = 4;
  $texy->linkModule->root = "";
  $texy->mergeLines = TRUE;
  
  return $texy->process($texy_text);
}

class gtd_rpc_server extends json_rpc_server
{
  public function _pre_call($method, $params)
  {
    $GLOBALS['db'] = new database("pgsql:dbname=mygtd", "postgres", "heslo");

    if (!$GLOBALS['db']->table_exists("tasks"))
    {
      $GLOBALS['db']->query("CREATE TABLE categories (id SERIAL, name TEXT NOT NULL)");
      $GLOBALS['db']->query("CREATE TABLE tasks (id SERIAL, title TEXT NOT NULL, detail TEXT, category_id INTEGER NOT NULL, exdate DATE NOT NULL, done BOOLEAN NOT NULL)");
      $GLOBALS['db']->iquery("INSERT INTO categories (name) VALUES (?)", "Práce");
      $GLOBALS['db']->iquery("INSERT INTO categories (name) VALUES (?)", "Osobní");
      $GLOBALS['db']->iquery("INSERT INTO categories (name) VALUES (?)", "Ostatní");
    }

    return null;
  }

  public function getTasks()
  {
    $obj = new stdClass;
    $obj->tasks = $GLOBALS['db']->iquery("SELECT *, tasks.category_id AS category FROM tasks ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($obj->tasks as &$task)
      $task['html'] = texy_process($task['detail']);
    $obj->categories = $GLOBALS['db']->iquery("SELECT * FROM categories ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    return $obj;
  }

  public function createTask($task)
  {
    $id = $GLOBALS['db']->col_iquery("INSERT INTO tasks(title, detail, exdate, category_id, done) VALUES (?, ?, ?, ?, ?) RETURNING id", 
      $task->title, $task->detail, $task->exdate, (int)$task->category_id, $task->done ? 'true' : 'false');
    return array('id' => $id, 'html' => texy_process($task->detail));
  }

  public function createCategory($name)
  {
    $id = $GLOBALS['db']->col_iquery("INSERT INTO categories(name) VALUES (?) RETURNING id", $name);
    return array('id' => $id);
  }

  public function updateTask($task)
  {
    $GLOBALS['db']->iquery("UPDATE tasks SET title = ?, detail = ?, exdate = ?, category_id = ?, done = ? WHERE id = ?", 
      $task->title, $task->detail, $task->exdate, (int)$task->category_id, $task->done ? 'true' : 'false', (int)$task->id);
    return array('id' => $task->id, 'html' => texy_process($task->detail));
  }

  public function deleteTask($task_id)
  {
    $GLOBALS['db']->iquery("DELETE FROM tasks WHERE id = ?", (int)$task_id);
  }
}

// run the server
$server = new gtd_rpc_server();
$server->run();

?>
