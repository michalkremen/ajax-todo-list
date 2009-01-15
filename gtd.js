var G = {};

/* {{{ Data model: G.Task */

G.Task = Class.create(X.Signals,
{
  initialize: function(title, detail, category, exdate, status)
  {
    this.title = title;
    this.detail = detail;
    this.category = category;
    this.exdate = typeof exdate == 'date' ? exdate : Date.parse(exdate);
    this.status = status;
  },

  setTitle: function(text)
  {
    this.title = text;
    this.emit('changed', 'title');
  },

  setDetail: function(text)
  {
    this.detail = text;
    this.emit('changed', 'detail');
  },

  setExDate: function(exdate)
  {
    var new_exdate = typeof exdate == 'date' ? exdate : Date.parse(exdate);
    if (!this.exdate || !this.exdate.equals(new_exdate))
    {
      this.exdate = new_exdate;
      this.emit('changed', 'exdate');
    }
  },

  setCategory: function(category)
  {
    this.category = category;
    this.emit('changed', 'category');
  },

  toggleStatus: function()
  {
    this.setStatus(this.status.name == 'active' ? G.app.task_statuses.done : G.app.task_statuses.active);
  },

  setStatus: function(status)
  {
    this.status = status;
    this.emit('changed', 'state');
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
    data.category = this.category.title;
    data.done = this.status.name == 'done';
    return data;
  }
});

/* }}} */
/* {{{ Data model: G.TaskCategory */

G.TaskCategory = Class.create(X.Signals,
{
  initialize: function(title)
  {
    this.title = title;
  },

  setTitle: function(text)
  {
    this.title = text;
    this.emit('changed', 'title');
  },

  destroy: function()
  {
    this.emit('destroyed');
  }
});

/* }}} */
/* {{{ Data model: G.TaskState */

G.TaskState = Class.create(X.Signals,
{
  initialize: function(name, title)
  {
    this.name = name;
    this.title = title;
  }
});

/* }}} */
/* {{{ Data model: G.TaskList */

/** List of tasks.
 *
 * - The list monitors tasks for destruction and changes and updates itself.
 * - You can query the list for various views on the tasks. (groupped by day,
 *   etc.)
 */
G.TaskList = Class.create(X.Signals,
{
  initialize: function()
  {
    this.clear();
  },

  clear: function()
  {
    this.list = $A();
  },

  addTask: function(task)
  {
    this.list.push(task);
    task.connect('changed', this.taskChange.bind(this));
    task.connect('destroyed', this.taskDestroy.bind(this, task));
    this.emit('task-added');
  },

  delTask: function(task)
  {
    this.list = this.list.without(task);
    this.emit('task-removed');
  },

  taskChange: function(field)
  {
    if (field == 'exdate')
      this.emit('date-changed');
  },

  taskDestroy: function(task)
  {
    this.delTask(task);
  },

  getTasks: function()
  {
    return this.list;
  },

  getTasksByDay: function(from_date, to_date)
  {
    var groups = $A();
    var last_group;

    this.list.select(function(t) {  
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
  }
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
    this.timer = this.hide.bind(this).delay(3);
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
    this.b_newcat.hide(); //TODO: new category creation
    G.app.task_categories.each(function(c) {
      var option = new Element('option', {value: c.title});
      option.update(c.title.escapeHTML());
      this.i_category.insert(option);
    }, this);

    // date parser/validator/selector
    this.i_date.setValue('today');
    this.b_date.observe('click', this.onDateClick.bindAsEventListener(this));

    // realtime form validation
    this.i_date.observe('keyup', this.onDateChange.bindAsEventListener(this));
    this.i_text.observe('keyup', this.onTextChange.bindAsEventListener(this));

    this.checkInput();
  },

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
  /* {{{ Form data load/save */

  getData: function()
  {
    var data = {};
    G.app.task_categories.each(function(c) {
      if (c.title == this.i_category.getValue())
        data.category = c;
    }, this);
    var lines = $A(this.i_text.getValue().strip().split(/\n/));
    data.title = lines.shift();
    data.detail = lines.join("\n").strip();
    data.exdate = this.i_date.getValue();
    return data;
  },

  setFromTask: function(task)
  {
    this.i_category.setValue(task.category.title);
    this.i_date.setValue(task.exdate.toString('d.M.yyyy'));
    this.i_text.setValue(task.title + "\n\n" + task.detail);
    this.checkInput();
  },

  updateTask: function(task)
  {
    var data = this.getData();
    task.setTitle(data.title);
    task.setDetail(data.detail);
    task.setCategory(data.category);
    task.setExDate(data.exdate);
  },

  createTask: function()
  {
    var data = this.getData();
    return new G.Task(data.title, data.detail, data.category, data.exdate, G.app.task_statuses.active);
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
    this.emit('save', this.editor.createTask());
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
      '<div class="detail"></div>'+
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
    this.editor.updateTask(this.task);
  },

  onEditDone: function()
  {
    this.hideEditor();
  },

  /* }}} */
  /* {{{ Task buttons */

  onDeleteClick: function(event)
  {
    this.task.destroy();
    event.stop();
  },

  onStateClick: function(event)
  {
    this.task.toggleStatus();
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
    var active = task.status.name == 'active';
    this.e_title.update(task.title.escapeHTML());
    this.e_category.update(task.category.title.escapeHTML());
    this.e_detail.update(task.detail.escapeHTML());
    this.b_state.update(active ? 'hotovo' : 'není hotovo');
    if (active)
      this.element.removeClassName('done');
    else
      this.element.addClassName('done');
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
    //view.hide(true);
    //this.b_newtask.enable();
    G.app.tasks.addTask(task);
    G.app.createTask(task);
    this.renderDays();
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

G.App = Class.create(
{
  initialize: function(el)
  {
    this.element = $(el);

    // load default options
    this.options = Object.extend({
      rpcpath: ''
    }, arguments[1] || {});

    // initialize notificator widget
    this.notify = new G.Notify('notify');
    this.rpc = new X.RPC('rpc.php');

    // load test data
    this.task_statuses = {};
    this.task_statuses.done = new G.TaskState('done', 'Hotovo');
    this.task_statuses.active = new G.TaskState('active', 'Aktivní');

    this.task_categories = $A();
    this.task_categories.push(this.c_work = new G.TaskCategory('Práce'));
    this.task_categories.push(this.c_pers = new G.TaskCategory('Osobní'));

    this.tasks = new G.TaskList();  // global task list, contains all tasks
    this.tasks.connect('date-changed', (function() { this.view.renderDays(); }).bind(this));
    this.tasks.connect('task-removed', (function() { this.view.renderDays(); }).bind(this));

    // create tasks view
    this.view = new G.TaskListView('Všechny úkoly');
    this.element.insert(this.view.element);

    this.loadTasks();
  },

  loadTasks: function()
  {
    this.tasks.clear();
    this.rpc.call('getTasks', (function(retval) {
      retval.each(function(t) {
        var task = new G.Task(t.title, t.detail, this.c_work, t.exdate, t.done ? this.task_statuses.done : this.task_statuses.active);
        task.id = t.id;
        this.tasks.addTask(task);
        task.connect('destroyed', this.deleteTask.bind(this, task));
        task.connect('changed', this.updateTask.bind(this, task));
      }, this);
      this.notify.notify('Úkoly byly načteny');
      this.view.renderDays();
    }).bind(this));
  },

  createTask: function(task)
  {
    this.rpc.call('createTask', (function(retval) {
      task.id = retval;
      task.connect('destroyed', this.deleteTask.bind(this, task));
      task.connect('changed', this.updateTask.bind(this, task));
      this.notify.notify('Úkol byl uložen');
    }).bind(this), task.getData());
  },

  updateTask: function(task)
  {
    this.rpc.call('updateTask', (function(retval) {
      this.notify.notify('Úkol byl aktualizován');
    }).bind(this), task.getData());
  },

  deleteTask: function(task)
  {
    this.rpc.call('deleteTask', (function(retval) {
      this.notify.notify('Úkol byl odstraněn');
    }).bind(this), task.id);
  }
});

/* }}} */

G.init = function()
{
  G.app = new G.App('app');
};

document.observe("dom:loaded", function() {
  G.init();
});
