var X = {};

function log(str)
{
  try { console.log(str); } catch(e) { }
}

X.Signals =
{
  /** Connect the signal handler.
   *
   * name: name of the signal
   * func: signal handler
   * ctx: context in which the signal handler should run (this)
   * args...: additional arguments
   *
   * Example:
   * this.name = 'c';
   * someobj.connect('changed', function(msg1, msg2) { alert(msg1 + msg2 + this.name); }, this, 'a');
   * someobj.emit('changed', 'b');
   *
   * This would result in message box popping up with a string 'a b c'.
   */
  connect: function(name, func)
  {
    if (!Object.isArray(this._signals))
      this._signals = [];
    if (!Object.isArray(this._signals[name]))
      this._signals[name] = [];
    if (arguments.length > 2)
      func = func.bind.apply(func, $A(arguments).slice(2));
    this._signals[name].push(func);
  },

  emit: function(name)
  {
    if (!this._signals_freezed)
    {
      var self = this, args = $A(arguments).slice(1);
      if (!Object.isArray(this._signals))
        this._signals = [];
      return (this._signals[name] || []).collect(function(func) { return func.apply(self, args); });
    }
  },

  freezeSignals: function()
  {
    this._signals_freezed = true;
  },

  thawSignals: function()
  {
    this._signals_freezed = false;
  }
};

X.RPC = Class.create(X.Signals,
{
  initialize: function(url)
  {
    this.url = url;
  },
  
  call: function(method, cb)
  {
    new Ajax.Request(this.url, {
      method: 'post',
      contentType: 'application/json',
      requestHeaders: { Accept: 'application/json' },
      postBody: Object.toJSON({version: '1.1', method: method, params: $A(arguments).slice(2)}),
      onSuccess: this.callFinish.bind(this, cb)
    });
  },

  callFinish: function(cb, request)
  {
    var response = request.responseJSON;
    if (response.error)
      this.emit('error', response.error);
    else
      cb(response.result, response.error);
  }
});
