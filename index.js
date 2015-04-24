"use strict";

var Promise = global.Promise || require('lie');
var events = require('events');
var inherits = require('inherits');

function Interpreter(stdlib) {
  events.EventEmitter.call(this);

  this._vars = {};
  this._stdlib = stdlib;

  stdlib.true = function () {
    return Promise.resolve(1);
  };

  stdlib.false = function () {
    return Promise.resolve(0);
  };

  stdlib.return = function (val) {
    return Promise.reject({type: 'return', value: val || 0});
  };

  stdlib.break = function () {
    return Promise.reject({type: 'break'});
  };

  stdlib.end = function () {
    return Promise.reject({type: 'end'});
  };
}
inherits(Interpreter, events.EventEmitter);
module.exports = Interpreter;

Interpreter.prototype.run = function (ast) {
  return this._runBlock({}, ast.body).catch(function (exc) {
    if (exc.type !== 'end') {
      throw exc;
    }
  });
};

Interpreter.prototype._runBlock = function (locals, block) {
  var self = this;
  var done = Promise.resolve();
  block.forEach(function (stmtNode) {
    done = done.then(self._runStatement.bind(self, locals, stmtNode));
  });

  return done;
};

Interpreter.prototype._runStatement = function (locals, stmt) {
  return {
    CallStatement: this._runCallStatement,
    ProcedureStatement: this._runProcedureStatement,
    InfiniteLoopStatement: this._runInfiniteLoopStatement,
    WhileLoopStatement: this._runWhileLoopStatement,
    CountLoopStatement: this._runCountLoopStatement,
    ConditionalStatement: this._runConditionalStatement
  }[stmt.type].call(this, locals, stmt);
};

Interpreter.prototype._runCallStatement = function (locals, stmt) {
  return this._evalCallExpression(locals, stmt.expr);
};

Interpreter.prototype._runProcedureStatement = function (locals, stmt) {
  var self = this;
  self._vars[stmt.name] = function () {
    var args = arguments;
    var newLocals = {};
    stmt.arguments.forEach(function (name, i) {
      newLocals[name] = args[i];
    });
    return self._runBlock(newLocals, stmt.body).then(function () {
      return 0;
    }).catch(function (exc) {
      if (exc.type === 'return') {
        return exc.value;
      }
      throw exc;
    });
  };
};

Interpreter.prototype._runInfiniteLoopStatement = function (locals, stmt) {
  var self = this;
  function loop() {
    return self._runLoopBlock(locals, stmt, loop);
  }
  return loop();
};

Interpreter.prototype._runLoopBlock = function (locals, stmt, cb) {
  return this._runBlock(locals, stmt.body).then(cb).catch(function (exc) {
    if (exc.type !== 'break') {
      throw exc;
    }
  });
};

Interpreter.prototype._runWhileLoopStatement = function (locals, stmt) {
  var self = this;
  function loop() {
    return self._evalExpression(locals, stmt.test).then(function (result) {
      if (result) {
        return self._runLoopBlock(locals, stmt, loop);
      }
    });
  }
  return loop();
};

Interpreter.prototype._runCountLoopStatement = function (locals, stmt) {
  var self = this;
  var i = 0;
  function loop() {
    return self._evalExpression(locals, stmt.count).then(function (count) {
      if (i < count) {
        i++;
        return self._runLoopBlock(locals, stmt, loop);
      }
    });
  }
  return loop();
};

Interpreter.prototype._runConditionalStatement = function (locals, stmt) {
  var self = this;
  function conditional(i) {
    var evalExpr = self._evalExpression(locals, stmt.tests[i].test);
    return evalExpr.then(function (resp) {
      if (resp) {
        // execute if body
        return self._runBlock(locals, stmt.tests[i].then);
      }
      if (stmt.tests.length - 1 === i) {
        // try else
        return self._runBlock(locals, stmt.otherwise);
      }
      // try next else if
      return conditional(i + 1);
    });
  }
  return conditional(0);
};

Interpreter.prototype._evalExpression = function (locals, expr) {
  return {
    CallExpression: this._evalCallExpression,
    Literal: this._evalLiteral,
    UnaryExpression: this._evalUnaryExpression,
    BinaryExpression: this._evalBinaryExpression
  }[expr.type].call(this, locals, expr);
};

Interpreter.prototype._evalCallExpression = function (locals, expr) {
  var func;
  var self = this;
  if (expr.nativeName) {
    func = self._stdlib[expr.nativeName];
  } else {
    func = self._vars[expr.name] || locals[expr.name];
  }
  if (typeof func === 'undefined') {
    return Promise.reject(new ReferenceError("Unknown variable '" + expr.name + "'."));
  }
  var argsDone = Promise.resolve();
  var args = [];
  expr.arguments.forEach(function (argNode) {
    var evalArg = self._evalExpression.bind(self, locals, argNode);
    argsDone = argsDone.then(evalArg).then(function (arg) {
      args.push(arg);
    });
  });
  return argsDone.then(function () {
    self.emit('position', {
      line: expr.line,
      column: expr.column
    });
    return func.apply(null, args);
  });
};

Interpreter.prototype._evalLiteral = function (locals, expr) {
  return Promise.resolve(expr.value);
};

Interpreter.prototype._evalUnaryExpression = function (locals, expr) {
  return this._evalExpression(locals, expr.value).then({
    'not': function (a) { return +!a; },
    '-': function (a) { return a; }
  }[expr.operator.type]);
};

Interpreter.prototype._evalBinaryExpression = function (locals, expr) {
  var left = this._evalExpression.bind(this, locals, expr.left);
  var right = this._evalExpression.bind(this, locals, expr.right);

  return ({
    'or': function () {
      return left().then(function (leftVal) {
        return +leftVal || right().then(function (rightVal) {
          return +rightVal;
        });
      });
    },
    'and': function () {
      return left().then(function (leftVal) {
        return +leftVal && right().then(function (rightVal) {
          return +rightVal;
        });
      });
    }
  }[expr.operator.type] || function () {
    return Promise.all([left, right]).then(function (values) {
      return Promise.resolve({
        '*': function (a, b) { return a * b; },
        // emulate integer division
        '/': function (a, b) { return ~~(a / b); },
        '+': function (a, b) { return a + b; },
        '-': function (a, b) { return a - b; },
        '==': function (a, b) { return +(a === b); },
        '~=': function (a, b) { return +(a !== b); },
        '<': function (a, b) { return +(a < b); },
        '<=': function (a, b) { return +(a <= b); },
        '>': function (a, b) { return +(a > b); },
        '>=': function (a, b) { return +(a >= b); }
      }[expr.operator.type]());
    });
  })();
};
