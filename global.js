var X = {};

function log(str)
{
  try { console.log(str); } catch(e) { }
}

X.Signals =
{
  connect: function(name, func)
  {
    if (!Object.isArray(this._signals))
      this._signals = [];
    if (!Object.isArray(this._signals[name]))
      this._signals[name] = [];
    this._signals[name].push(func);
  },

  emit: function(name)
  {
    var self = this;
    var args = $A(arguments).slice(1);
    if (!Object.isArray(this._signals))
      this._signals = [];
    (this._signals[name] || []).collect(function(func) { func.apply(self, args); });
  }
};

X.RPC = Class.create(
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
    cb(response.result, response.error);
  }
});
