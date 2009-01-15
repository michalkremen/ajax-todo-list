var X = {};

function log(str)
{
  try { console.log(str); } catch(e) { }
}

function go(link, new_widow)
{
  if (new_widow)
    window.open(link);
  else
    window.location.href = link;
  return false;
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

X.ContextMenu = Class.create(
{
  initialize: function()
  {
    this.items = [];
  },

  add_item: function(text, handler, image)
  {
    var item = new Object();
    item.handler = handler;
    item.text = text;
    item.image = image;
    this.items.push(item);
  },

  render: function(x, y)
  {
    var menu = document.createElement('div');
    Element.extend(menu);
    var list = document.createElement('ul');
    menu.appendChild(list);
    menu.className = 'ctxmenu';
    document.body.appendChild(menu);

    this.items.each(function(i) {
      i.li = document.createElement('li');
      list.appendChild(i.li);
      i.li.appendChild(document.createTextNode(i.text));
      Event.observe(i.li, 'mousedown', i.handler);
    });

    menu.makePositioned();
    menu.style.top = y+'px';
    menu.style.left = x+'px';
    this.menu = menu;

    this.destroyHandler = this.destroy.bindAsEventListener(this);
    Event.observe(document, 'mousedown', this.destroyHandler);
  },

  destroy: function(evt)
  {
    if (this.menu)
    {
      Event.stopObserving(document, 'mousedown', this.destroyHandler);
      this.menu.remove();
      this.menu = null;
    }
  }
});

/** Focus on the first input inside some element
 */
X.autoFocus = function(element)
{
  var specific = document.body.select('.focus').first();
  if (specific)
  {
    specific.focus();
    return;
  }

  if (!element)
    element = document.documentElement;

  for (var node = $(element).firstChild; node; node = node.nextSibling)
  {
    if (node.nodeType != 1)
      continue;

    Element.extend(node);
    if (node.nodeName == 'INPUT' || node.nodeName == 'SELECT')
    {
      if (node.readAttribute('type') != 'hidden' && !node.disabled && node.visible())
      {
        node.activate();
        return true;
      }
    }
    else
      if (X.autoFocus(node))
        return true;
  }

  return false;
};

/** Autocompletion
 */
X.enableAutoComplete = function(element)
{
  if (!element)
    element = document.documentElement;

  $(element).select('input[ac-data-url!=""]').each(function(node)
  {
    if (!node.readAttribute('ac-off') && !node.ac_enabled)
    {
      node.ac_enabled = true;
      var menu = document.createElement("div");
      menu.className = "autocomplete";
      node.parentNode.appendChild(menu);
      new X.AjaxRedirectAutocompleter(node, menu, node.readAttribute('ac-data-url'), {
        paramName: 'query'
      });
    }
  });
};

X.RPC = Class.create(
{
  initialize: function(url)
  {
    this.url = url;
  },
  
  call: function(method, cb, context)
  {
    new Ajax.Request(this.url, {
      method: 'post',
      requestHeaders: { Accept: 'application/json' },
      parameters: { jsonrpc: Object.toJSON({method: method, params: $A(arguments).slice(2)}) },
      onSuccess: this.callFinish.bind(this, cb)
    });
  },

  callFinish: function(cb, request)
  {
    var response = request.responseJSON;
    cb(response.retval);
  }
});
