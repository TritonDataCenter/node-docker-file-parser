var fs = require('fs')
var tape = require('tape')
var dockerfileParser = require('../parser')

tape('should parse a Dockerfile', function (t) {

  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/Dockerfile', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);

  var numCommands = 15;
  t.assert(commands.length === numCommands, 'Check number of commands');

  var from = commands[0];
  t.assert(from.name === 'FROM', 'First command should be FROM');

  var add = commands[1];
  t.assert(add.name === 'ADD', 'Check ADD command');
  t.assert(add.args[0] === '.', 'Check ADD first arg');
  t.assert(add.args[1] === '/srv/app', 'Check ADD second arg');

  var env = commands[7];
  t.assert(env.name === 'ENV', '8th command is ENV');
  t.assert(Object.keys(env.args).length === 2, 'ENV command has 2 keys');
  t.assert(env.args['VAR2'] === '20', 'ENV VAR2 check');
  t.assert(env.args['VAR3'] === '30', 'ENV VAR3 check');

  t.assert(commands[numCommands-1].name === 'ENTRYPOINT',
            'Last command should be ENTRYPOINT');

  t.end();
});
