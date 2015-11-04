var fs = require('fs')
var tape = require('tape')
var dockerfileParser = require('../parser')

tape('should parse a Dockerfile', function (t) {

  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/Dockerfile', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);

  var numCommands = 15;
  t.equal(commands.length, numCommands, 'Check number of commands');

  var from = commands[0];
  t.equal(from.name, 'FROM', 'First command should be FROM');

  var add = commands[1];
  t.equal(add.name, 'ADD', 'Check ADD command');
  t.equal(add.args[0], '.', 'Check ADD first arg');
  t.equal(add.args[1], '/srv/app', 'Check ADD second arg');

  var env = commands[7];
  t.equal(env.name, 'ENV', '8th command is ENV');
  t.equal(Object.keys(env.args).length, 2, 'ENV command has 2 keys');
  t.equal(env.args['VAR2'], '20', 'ENV VAR2 check');
  t.equal(env.args['VAR3'], '30', 'ENV VAR3 check');

  t.equal(commands[numCommands-1].name, 'ENTRYPOINT',
            'Last command should be ENTRYPOINT');

  t.end();
});


tape('mesos Dockerfile', function (t) {

  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/mesos/Dockerfile', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);

  t.equal(commands.length, 18, 'Check number of commands');
  t.equal(commands[0].name, 'FROM', 'First command should be FROM');
  t.equal(commands[17].name, 'WORKDIR', 'Last command should be WORKDIR');

  t.end();
});


tape('case insensitive', function (t) {

  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/caseTest', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);

  t.equal(commands.length, 3, 'Check number of commands');
  t.equal(commands[0].name, 'FROM', 'Command should be FROM');
  t.equal(commands[1].name, 'ADD',  'Command should be ADD');
  t.equal(commands[2].name, 'COPY', 'Command should be COPY');

  t.end();
});
