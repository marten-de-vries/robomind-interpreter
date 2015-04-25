robomind-interpreter
====================

[![Build Status](https://travis-ci.org/marten-de-vries/robomind-interpreter.svg?branch=master)](https://travis-ci.org/marten-de-vries/robomind-interpreter)
[![Dependency Status](https://david-dm.org/marten-de-vries/robomind-interpreter.svg)](https://david-dm.org/marten-de-vries/robomind-interpreter)
[![devDependency Status](https://david-dm.org/marten-de-vries/robomind-interpreter/dev-status.svg)](https://david-dm.org/marten-de-vries/robomind-interpreter#info=devDependencies)

Interpretes an AST as generated by
[robomind-parser](https://www.npmjs.com/package/robomind-parser).
robomind-interpreter was written for use by
[SkidBot](https://github.com/marten-de-vries/skidbot).

API
---

``var Interpreter = require('robomind-interpreter');``

- ``var interpreter = new Interpreter(stdlib)``
  stdlib is an object containing implementations for RoboMind functions.
  They should accept the same arguments as their RoboMind equivalents,
  and return a Promise that either resolves to 0, or another integer
  that makes sense, or rejects with an error which stops the whole
  interpreting process and passes it to the user.

- ``interpreter.run(ast)``
   Interpretes the code specified with ``ast``, using the standard
   library supplied in the constructor. Returns a promise.

- ``interpreter.on('position', callback)``
  ``callback`` is called whenever a function is executed, with the
  as argument some information on the function call:
  ``{line: 1, column: 1}`` for example.

Contributing
------------

Relevant commands are:

- ``npm install``
- ``npm test``

TODOS
-----

- A real test suite (not just running it a bit against SkidBot.)
- Figure out scoping rules properly (and add tests for them.)
