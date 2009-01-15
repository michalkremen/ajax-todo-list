var G = {};

/* {{{ Data model: G.Task */

G.Task = Class.create(X.Signals,
{
  initialize: function(data)
  {
    this.setFrom({
      title: '',
      detail: '',
      done: false,
      exdate: Date.today(),
      category: G.app.tasks.categories.first()
    });
    this.setFrom(data);
  },

  setFrom: function(data)
  {
    var changed = $A();
    ['title', 'detail', 'done', 'id', 'exdate', 'category', 'html'].each(function(param) {
      if (!Object.isUndefined(data[param]))
      {
        if (param == 'exdate')
        {
          var exdate = Date.parse(data[param].toString());
          if (!exdate)
            exdate = Date.today();
          if (Object.isUndefined(this.exdate) || !this.exdate.equals(exdate))
            changed.push(param);
          this.exdate = exdate;
        }
        else if (param == 'category')
        {
          var category = data[param];
          if (typeof category != 'object')
            category = G.app.tasks.categories.find(function(c) { return c.id == category; });
          //XXX: category may not exist
          if (Object.isUndefined(this.category) || this.category.id != category.id)
            changed.push(param);
          this.category = category;
        }
        else
        {
          if (Object.isUndefined(this[param]) || this[param] != data[param])
            changed.push(param);
          this[param] = data[param];
        }
      }
    }, this);

    if (changed.size() > 0)
      this.emit('changed', changed);
  },

  toggleDone: function()
  {
    this.done = !this.done;
    this.emit('changed', ['done']);
  },

  destroy: function()
  {
    this.emit('destroyed');
  },

  getData: function()
  {
    var data = {};
    data.id = this.id;
    data.title = this.title;
    data.detail = this.detail;
    data.exdate = this.exdate.toString('yyyy-MM-dd');
    data.category_id = this.category.id;
    data.done = this.done;
    return data;
  }
});

/* }}} */
/* {{{ Data model: G.TaskCategory */

G.TaskCategory = Class.create(X.Signals,
{
  initialize: function(data)
  {
    this.setFrom({name: '', id: null});
    this.setFrom(data);
  },

  setFrom: function(data)
  {
    var changed = $A();
    ['name', 'id'].each(function(param) {
      if (!Object.isUndefined(data[param]))
      {
        if (Object.isUndefined(this[param]) || this[param] != data[param])
          changed.push[param];
        this[param] = data[param];
      }
    }, this);

    if (changed.size() > 0)
      this.emit('changed', changed);
  },

  destroy: function()
  {
    this.emit('destroyed');
  }
});

/* }}} */
/* {{{ Data model: G.TaskList */

/** List of tasks synchronized with the server.
 */
G.TaskList = Class.create(X.Signals,
{
  initialize: function(rpc)
  {
    this.tasks = $A();
    this.categories = $A();
    this.rpc = rpc;
  },

  start: function()
  {
    this.load();
    this.executer = new PeriodicalExecuter((function() {
      this.load();
    }).bind(this), 8);
  },

  /* {{{ Internal methods */

  addTask: function(task)
  {
    this.tasks.push(task);
    task.connect('changed', this.taskChanged, this);
    task.connect('destroyed', this.taskDestroyed, this, task);
    this.emit('changed', 'add');
  },

  removeTask: function(task)
  {
    this.tasks = this.tasks.without(task);
    this.emit('changed', 'remove');
  },

  taskChanged: function(fields)
  {
    if (fields.include('exdate'))
      this.emit('changed', 'date');
  },

  taskDestroyed: function(task)
  {
    this.removeTask(task);
  },

  /* }}} */

  getTasks: function()
  {
    return this.tasks;
  },

  getTasksByDay: function(from_date, to_date)
  {
    var groups = $A();
    var last_group;

    this.tasks.select(function(t) {  
      if (from_date && t.exdate.isBefore(from_date))
        return false;
      if (to_date && t.exdate.isAfter(to_date))
        return false;
      return true;
    }).sortBy(function(t) { 
      return t.exdate.toString('yyyy-MM-dd'); 
    }).each(function(t) {
      if (!last_group || !last_group.date.equals(t.exdate))
      {
        last_group = { 
          tasks: $A(),
          date: t.exdate,
          name: t.exdate.toString('d. MMMM yyyy')
        };
        groups.push(last_group);
      }
      last_group.tasks.push(t);
    });

    return groups;
  },

  /* {{{ Server communication routines */

  load: function()
  {
    this.emit('rpc', 'load-pre');
    this.rpc.call('getTasks', (function(retval) {
      // update categories list from the server
      this.categories = $A();
      retval.categories.each(function(data) {
        this.categories.push(new G.TaskCategory(data));
      }, this);
      this.emit('categories-changed');

      this.freezeSignals();
      // drop removed tasks
      this.tasks.each(function(old_task) {
        var new_task = retval.tasks.find(function(t) { return t.id == old_task.id });
        if (!new_task)
          old_task.destroy();
      }, this);

      // update tasks list from the server
      retval.tasks.each(function(data) {
        var old_task = this.tasks.find(function(t) { return t.id == data.id });
        if (old_task)
          old_task.setFrom(data);
        else
          this.addTask(new G.Task(data));
      }, this);
      this.thawSignals();
      this.emit('changed', 'load');

      this.emit('rpc', 'load-post');
    }).bind(this));
  },

  createTask: function(task)
  {
    this.emit('rpc', 'create-task-pre');
    this.rpc.call('createTask', (function(retval) {
      task.setFrom(retval);
      this.addTask(task);
      this.emit('rpc', 'create-task-post');
    }).bind(this), task.getData());
  },

  updateTask: function(task)
  {
    this.emit('rpc', 'update-task-pre');
    this.rpc.call('updateTask', (function(retval) {
      task.setFrom(retval);
      this.emit('rpc', 'update-task-post');
    }).bind(this), task.getData());
  },

  deleteTask: function(task)
  {
    this.emit('rpc', 'delete-task-pre');
    this.rpc.call('deleteTask', (function(retval) {
      task.destroy();
      this.emit('rpc', 'delete-task-post');
    }).bind(this), task.id);
  },

  createCategory: function(category)
  {
    this.emit('rpc', 'create-category-pre');
    this.rpc.call('createCategory', (function(retval) {
      category.setFrom(retval);
      this.categories.push(category);
      this.emit('categories-changed');
      this.emit('rpc', 'create-category-post');
    }).bind(this), category.name);
  }

  /* }}} */
});

/* }}} */
/* {{{ Views: G.Notify - notification box on the top of the page */

/** Notification box.
 */
G.Notify = Class.create(
{
  initialize: function(el)
  {
    this.element = $(el);
    this.text = this.element.down('div');
  },

  show: function(text)
  {
    this.text.update(text.escapeHTML());

    if (!this.text.visible())
      new Effect.Appear(this.text, {duration: 0.3});
  },

  notify: function(text)
  {
    this.show(text);
    if (this.timer)
    {
      clearTimeout(this.timer);
      this.timer = 0;
    }
    this.timer = this.hide.bind(this).delay(4);
  },

  hide: function()
  {
    if (this.text.visible())
      new Effect.Fade(this.text, {duration: 0.3});
  }
});

/* }}} */
/* {{{ Views: G.TaskEditor - task editor, used in the edit mode of G.TaskView and G.NewTaskView */

G.TaskEditor = Class.create(X.Signals,
{
  initialize: function(el)
  {
    this.element = $(el);
    this.element.update(
      '<div class="error"></div>'+
      '<label>Kategorie:</label> <select name="category"></select> <a class="btn_newcat" href="#">nová...</a><br/>'+
      '<label>Datum:</label> <input type="text" name="date" /> <a class="btn_date" href=""></a><br/>'+
      '<textarea name="text"></textarea><br/>'+
      '<input type="button" class="btn_save" value="Uložit" />'+
      '<input type="button" class="btn_cancel" value="Zrušit" />'
    );
    this.i_category = this.element.select('select[name=category]').first();
    this.i_date = this.element.select('input[name=date]').first();
    this.i_text = this.element.select('textarea').first();
    this.b_newcat = this.element.select('.btn_newcat').first();
    this.b_save = this.element.select('.btn_save').first();
    this.b_cancel = this.element.select('.btn_cancel').first();
    this.b_date = this.element.select('.btn_date').first();
    this.e_error = this.element.select('.error').first();

    // save/cancel buttons
    this.b_save.observe('click', this.onSaveClick.bindAsEventListener(this));
    this.b_cancel.observe('click', this.onCancelClick.bindAsEventListener(this));

    // fill categories select
    this.b_newcat.observe('click', this.onNewCategoryClick.bindAsEventListener(this));
    this.loadCategoryOptions();
    G.app.tasks.connect('categories-changed', this.loadCategoryOptions.bind(this));

    // date parser/validator/selector
    this.i_date.setValue('today');
    this.b_date.observe('click', this.onDateClick.bindAsEventListener(this));

    // realtime form validation
    this.i_date.observe('keyup', this.onDateChange.bindAsEventListener(this));
    this.i_text.observe('keyup', this.onTextChange.bindAsEventListener(this));

    this.checkInput();
  },

  loadCategoryOptions: function()
  {
    var selected = this.i_category.getValue();
    this.i_category.update();
    G.app.tasks.categories.each(function(c) {
      var option = new Element('option', {value: c.id});
      option.update(c.name.escapeHTML());
      this.i_category.insert(option);
    }, this);
    this.i_category.setValue(selected);
  },

  setButtonLabels: function(save, cancel)
  {
    this.b_save.setValue(save);
    this.b_cancel.setValue(cancel);
  },

  /* {{{ New category */

  onNewCategoryClick: function(event)
  {
    event.stop();
    var name = prompt('Zadejte prosím název nové kategorie:');
    if (name && name.strip().length > 0)
      G.app.tasks.createCategory(new G.TaskCategory({name: name.strip()}));
    else
      G.app.notify.notify('Kategorie NEBYLA vytvořena');
  },

  /* }}} */
  /* {{{ Date selector */

  onDateClick: function(event)
  {
    event.stop();
    var d = Date.parse(this.i_date.getValue());
    if (d)
      this.i_date.setValue(d.toString('d.M.yyyy'));
    else
      this.i_date.setValue(Date.today().toString('d.M.yyyy'));
    this.onDateChange();
  },

  /* }}} */
  /* {{{ Form input validation */

  checkInput: function()
  {
    var msgs = $A();
    var d = Date.parse(this.i_date.getValue());
    if (d)
    {
      this.b_date.update(d.toString('d. MMMM yyyy').escapeHTML());
      this.i_date.removeClassName('error');
    }
    else
    {
      this.b_date.update('dnes');
      this.i_date.addClassName('error');
      msgs.push('Chybné datum');
    }

    var t = this.i_text.getValue();
    if (t.strip().length > 0)
    {
      this.i_text.removeClassName('error');
    }
    else
    {
      this.i_text.addClassName('error');
      msgs.push('Prázdný text úkolu');
    }

    this.b_save.disabled = msgs.size() > 0;
    this.e_error.update(msgs.join(', ').escapeHTML());
    if (msgs.size() > 0)
      this.e_error.show();
    else
      this.e_error.hide();
  },

  onDateChange: function(event)
  {
    this.checkInput();
  },

  onTextChange: function(event)
  {
    this.checkInput();
  },

  /* }}} */
  /* {{{ Form buttons event handlers */

  onSaveClick: function(event)
  {
    this.emit('save');
    this.emit('done');
  },

  onCancelClick: function(event)
  {
    this.emit('cancel');
    this.emit('done');
  },

  /* }}} */
  /* {{{ Form data */

  setFromTask: function(task)
  {
    this.i_category.setValue(task.category.id);
    this.i_date.setValue(task.exdate.toString('d.M.yyyy'));
    this.i_text.setValue(task.title + "\n\n" + task.detail);
    this.checkInput();
  },

  getData: function()
  {
    var data = {};
    var category_id = this.i_category.getValue();
    var lines = $A(this.i_text.getValue().strip().split(/\n/));
    data.title = lines.shift();
    data.detail = lines.join("\n").strip();
    data.exdate = this.i_date.getValue();
    data.category = Number(category_id);
    return data;
  }

  /* }}} */
});

/* }}} */
/* {{{ Views: G.NewTaskView - new task box */

G.NewTaskView = Class.create(X.Signals,
{
  initialize: function()
  {
    this.element = new Element('li', {'class': 'task'});
    this.element.view = this;
    this.e_edit = new Element('div', {'class': 'edit'});
    this.element.insert(this.e_edit);

    this.editor = new G.TaskEditor(this.e_edit);
    this.editor.connect('cancel', this.onNewTaskCancel.bind(this));
    this.editor.connect('save', this.onNewTaskSave.bind(this));
    this.editor.setButtonLabels('Přidat', 'Zavřít');

    this.element.hide();
  },

  /* {{{ Show/hide */

  show: function()
  {
    new Effect.BlindDown(this.element, { duration: 0.5 });
  },

  hide: function(destroy)
  {
    new Effect.BlindUp(this.element, {
      duration: 0.5, 
      afterFinish: destroy ? this.destroy.bind(this) : Prototype.emptyFunction
    });
  },

  destroy: function()
  {
    this.element.remove();
  },

  /* }}} */

  onNewTaskCancel: function()
  {
    this.emit('cancel');
  },

  onNewTaskSave: function()
  {
    this.emit('save', new G.Task(this.editor.getData()));
  }
});

/* }}} */
/* {{{ Views: G.TaskView - existing task box */

G.TaskView = Class.create(X.Signals,
{
  initialize: function()
  {
    this.element = new Element('li', {'class': 'task'});
    this.element.view = this;
    this.element.update(
      '<div class="title"><span class="category"></span> <span class="title"></span></div>'+
      '<div class="edit"></div>'+
      '<div class="detail content"></div>'+
      '<div class="controls">'+
      '<a href="" class="btn_edit">upravit</a> | <a href="" class="btn_delete">smazat</a> | <a class="btn_state" href="">hotovo</a>'+
      '</div>'
    );
    this.e_titlebox = this.element.select('div.title').first();
    this.e_title = this.element.select('span.title').first();
    this.e_category = this.element.select('span.category').first();
    this.e_edit = this.element.select('div.edit').first();
    this.e_detail = this.element.select('div.detail').first();
    this.e_controls = this.element.select('div.controls').first();
    this.b_edit = this.element.select('.btn_edit').first();
    this.b_delete = this.element.select('.btn_delete').first();
    this.b_state = this.element.select('.btn_state').first();

    this.b_edit.observe('click', this.onEditClick.bindAsEventListener(this));
    this.b_delete.observe('click', this.onDeleteClick.bindAsEventListener(this));
    this.b_state.observe('click', this.onStateClick.bindAsEventListener(this));

    this.element.hide();
  },

  /* {{{ Show/hide */

  show: function()
  {
    new Effect.BlindDown(this.element, { duration: 0.5 });
  },

  hide: function(destroy)
  {
    new Effect.BlindUp(this.element, {
      duration: 0.5, 
      afterFinish: destroy ? this.destroy.bind(this) : Prototype.emptyFunction
    });
  },

  destroy: function()
  {
    this.element.remove();
  },

  /* }}} */
  /* {{{ Task editor */

  onEditClick: function(event)
  {
    event.stop();
    this.e_edit.hide();
    this.editor = new G.TaskEditor(this.e_edit);
    this.editor.setFromTask(this.task);
    this.editor.connect('done', this.onEditDone.bind(this));
    this.editor.connect('save', this.onEditSave.bind(this));
    this.showEditor();
  },

  showEditor: function()
  {
    var options = { sync: true };
    new Effect.Parallel([
      new Effect.BlindUp(this.e_detail, options),
      new Effect.BlindUp(this.e_controls, options),
      new Effect.BlindUp(this.e_titlebox, options),
      new Effect.BlindDown(this.e_edit, options)
    ], { duration: 0.5 });
  },

  hideEditor: function()
  {
    var options = { sync: true };
    new Effect.Parallel([
      new Effect.BlindDown(this.e_detail, options),
      new Effect.BlindDown(this.e_controls, options),
      new Effect.BlindDown(this.e_titlebox, options),
      new Effect.BlindUp(this.e_edit, options)
    ], { duration: 0.5 });
  },

  onEditSave: function()
  {
    this.task.setFrom(this.editor.getData());
    G.app.tasks.updateTask(this.task);
  },

  onEditDone: function()
  {
    this.hideEditor();
  },

  /* }}} */
  /* {{{ Task buttons */

  onDeleteClick: function(event)
  {
    G.app.tasks.deleteTask(this.task);
    event.stop();
  },

  onStateClick: function(event)
  {
    this.task.toggleDone();
    G.app.tasks.updateTask(this.task);
    event.stop();
  },

  /* }}} */
  /* {{{ Data model link */

  setTask: function(task)
  {
    this.task = task;
    this.task.connect('changed', this.onTaskChange.bind(this));
    this.setFromTask(task);
  },

  onTaskChange: function()
  {
    this.setFromTask(this.task);
  },

  setFromTask: function(task)
  {
    this.e_title.update(task.title.escapeHTML());
    this.e_category.update(task.category.name.escapeHTML());
    this.e_detail.update(task.html ? task.html : task.detail.escapeHTML());
    this.b_state.update(!task.done ? 'hotovo' : 'není hotovo');
    if (task.done)
      this.element.addClassName('done');
    else
      this.element.removeClassName('done');
  }

  /* }}} */
});

/* }}} */
/* {{{ Views: G.TaskListView - groupped list of tasks */

G.TaskListView = Class.create(X.Signals,
{
  initialize: function(title)
  {
    this.element = new Element('div', {'class': 'tasklist'});
    this.element.insert(this.e_title = new Element('h2'));
    this.element.insert(this.e_controls = new Element('div', {'class': 'controls'}));
    this.element.insert(this.e_new_tasks = new Element('div', {'class': 'new_tasks'}));
    this.e_new_tasks.insert(this.e_new_tasks_list = new Element('ul', {'class': 'tasks'}));
    this.element.insert(this.e_list = new Element('div', {'class': 'list'}));
    //this.e_controls.insert(this.i_search = new Element('input', {type: 'text', value: ''}));
    this.e_controls.insert(this.b_newtask = new Element('input', {type: 'button', value: 'Nový úkol...'}));

    this.setTitle(title);
    this.b_newtask.observe('click', this.newTaskClick.bindAsEventListener(this))
  },

  setTitle: function(text)
  {
    this.e_title.update(text.escapeHTML());
  },

  /* {{{ New task creation */

  newTaskClick: function(event)
  {
    this.newTask();
  },

  newTask: function()
  {
    this.b_newtask.disable();
    var new_task_view = new G.NewTaskView();
    this.e_new_tasks_list.insert({top: new_task_view.element});
    new_task_view.show();
    new_task_view.connect('cancel', this.onNewTaskCancel.bind(this, new_task_view));
    new_task_view.connect('save', this.onNewTaskSave.bind(this, new_task_view));
  },

  onNewTaskCancel: function(view)
  {
    view.hide(true);
    this.b_newtask.enable();
  },

  onNewTaskSave: function(view, task)
  {
    G.app.tasks.createTask(task);
  },

  /* }}} */
  /* {{{ List update and rendering */

  getStructure: function()
  {
    var groups = $A();
    this.e_list.select('div.taskgroup').each(function(group_div) {
      var group = {};
      group.container = group_div;
      group.name = group_div.readAttribute('x-name');
      group.tasks = $A();
      group_div.select('li.task').each(function(task_div) {
        group.tasks.push(task_div.view);
      });
      groups.push(group);
    });
    return groups;
  },

  renderDays: function()
  {
    this.renderStructure(G.app.tasks.getTasksByDay());
  },

  /** This function is used tom manage list groups and their items.
   */
  renderStructure: function(new_structure)
  {
    var old_structure = this.getStructure();

    // remove non-existing groups and tasks
    old_structure.each(function(old_group) {
      var new_group = new_structure.find(function(g) { return g.name == old_group.name });
      if (new_group)
      {
        old_group.tasks.each(function(old_task) {
          var new_task = new_group.tasks.find(function(t) { return t === old_task.task });
          if (!new_task)
            old_task.hide(true);
        });
      }
      else
      { 
        // group removed
        new Effect.BlindUp(old_group.container, {
          duration: 0.5, 
          afterFinish: function() { old_group.container.remove(); }
        });
      }
    });

    // add new groups and tasks
    new_structure.each(function(new_group) {
      var old_group = old_structure.find(function(g) { return g.name == new_group.name });
      if (old_group)
      {
        new_group.tasks.each(function(new_task) {
          var old_task = old_group.tasks.find(function(t) { return t.task === new_task });
          if (!old_task)
          {
            var task_view = new G.TaskView();
            task_view.setTask(new_task);
            old_group.container.down('ul.tasks').insert(task_view.element);
            task_view.show();
          }
        });
      }
      else
      {
        // create new group container
        var group_div = new Element('div', {'class': 'taskgroup'});
        group_div.writeAttribute('x-name', new_group.name);
        var header = new Element('h3');
        header.update(new_group.name.escapeHTML());
        header.hide();
        var tasks_list = new Element('ul', {'class': 'tasks'});
        group_div.insert(header);
        group_div.insert(tasks_list);
        this.e_list.insert(group_div);
        new Effect.Appear(header, { duration: 1 });

        // add tasks
        new_group.tasks.each(function(task) {
          var task_view = new G.TaskView();
          task_view.setTask(task);
          tasks_list.insert(task_view.element);
          task_view.show();
        }, this);
      }
    }, this);
  }

  /* }}} */
});

/* }}} */
/* {{{ Views: G.App - toplevel controller for the whole application */

G.App = Class.create(X.Signals,
{
  initialize: function(el)
  {
    this.element = $(el);

    this.notify = new G.Notify('notify');
    this.rpc = new X.RPC('rpc.php');
    this.rpc.connect('error', function(e) { this.notify.notify(e.message); }, this);

    // global task list, contains all tasks
    this.tasks = new G.TaskList(this.rpc);
    this.tasks.connect('rpc', function(action) {
      this.notify.notify(action);
    }, this);
    this.tasks.connect('changed', function() { 
      this.view.renderDays(); 
    }, this);

    // create tasks view
    this.view = new G.TaskListView('Všechny úkoly');
    this.element.insert(this.view.element);

    this.tasks.start();
  },
});

/* }}} */

G.init = function()
{
  G.app = new G.App('app');
};

document.observe("dom:loaded", function() {
  G.init();
});
