<?php

require_once "database.php";

require_once dirname(__FILE__).DIRECTORY_SEPARATOR.'JSON.php';

if (!function_exists('json_decode'))
{
  function json_decode($content, $assoc=false)
  {
    if ($assoc)
      $json = new Services_JSON(SERVICES_JSON_LOOSE_TYPE);
    else
      $json = new Services_JSON;

    return $json->decode($content);
  }
}

if (!function_exists('json_encode'))
{
  function json_encode($content)
  {
    $json = new Services_JSON;

    return $json->encode($content);
  }
}

$db = new database("pgsql:dbname=mygtd", "postgres", "heslo");

// create tasks table if it doesn not exists
if ($db->col_iquery('SELECT COUNT(*) FROM pg_tables WHERE schemaname = ? AND tablename = ?', "public", "tasks") == 0)
  $db->iquery("CREATE TABLE tasks (id SERIAL, title TEXT, detail TEXT, category TEXT, exdate DATE, done BOOLEAN)");

function handle_rpc()
{
  global $db;

  if (!isset($_POST['jsonrpc']))
    return;

  $rpc = json_decode($_POST['jsonrpc']);
  $rpc->retval = null;
  $rpc->error = null;

  if ($rpc->method == 'getTasks')
  {
    $rpc->retval = $db->iquery("SELECT * FROM tasks ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
  }
  else if ($rpc->method == 'createTask')
  {
    $task = $rpc->params[0];
    //if (is_object($task) && isset($task->title) && isset($task->detail) && isset($task->exdate) && isset($task->category) && isset($task->done))
    $id = $db->col_iquery("INSERT INTO tasks(title, detail, exdate, category, done) VALUES (?, ?, ?, ?, ?) RETURNING id", 
      $task->title, $task->detail, $task->exdate, $task->category, $task->done ? 'true' : 'false');
    $rpc->retval = $id;
  }
  else if ($rpc->method == 'updateTask')
  {
    $task = $rpc->params[0];
    $db->iquery("UPDATE tasks SET title = ?, detail = ?, exdate = ?, category = ?, done = ? WHERE id = ?", 
      $task->title, $task->detail, $task->exdate, $task->category, $task->done ? 'true' : 'false', (int)$task->id);
  }
  else if ($rpc->method == 'deleteTask')
  {
    $db->iquery("DELETE FROM tasks WHERE id = ?", (int)$rpc->params[0]);
  }

  header('Content-Type: application/json');
  echo json_encode($rpc);
  exit(0);
}

handle_rpc();

?>
