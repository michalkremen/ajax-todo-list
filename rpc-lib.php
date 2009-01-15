<?php

require_once 'JSON.php';

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

abstract class rpc_server
{
  protected function _exec($method, $params)
  {
    if (!method_exists($this, $method))
      throw new Exception("Unknown method {$method}!");

    if (($retval = $this->_pre_call($method, $params)) !== null)
      return $retval;

    $retval = call_user_func_array(array($this, $method), $params);

    return $this->_post_call($method, $params, $retval);
  }

  protected function _pre_call($method, $params)
  {
    return null;
  }

  protected function _post_call($method, $params, $retval)
  {
    return $retval;
  }

  abstract public function run();
}

class json_rpc_server extends rpc_server
{
  public function run()
  {
    $return = new stdClass;
    $return->version = "1.1";

    try
    {
      $request = json_decode(file_get_contents('php://input'));
      if (!$request)
        throw new Exception("Invalid RPC call.");
      $return->result = $this->_exec($request->method, $request->params);
    }
    catch (Exception $ex)
    {
      $return->error = array('name' => 'JSONRPCError', 'code' => $ex->getCode(), 'message' => $ex->getMessage());
    }

    header('Content-Type: application/json');
    echo json_encode($return);
    exit(0);
  }
}

?>
