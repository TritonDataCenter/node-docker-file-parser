var fs = require('fs')
var tape = require('tape')
var dockerfileParser = require('../parser')


tape('every cmd', function (t) {
  var lines = [
    'FROM busybox:latest',

    'ADD foo.txt /',

    'ARG arg1',
    'ARG arg2=',
    'ARG arg3=',
    'ARG arg4=four',
    'ARG arg5="oh yeah"',

    'CMD shell string format',
    'CMD ["array", "format"]',

    'COPY foo.bar foo.baz /doo/',
    'COPY ["foo bar", "foo baz", "/doo/"]',

    'ENTRYPOINT shell string format',
    'ENTRYPOINT ["array", "format"]',

    'ENV key value',
    'ENV key2=value2',
    'ENV key3=value\ three= key4="value four"',

    'EXPOSE 80',
    'EXPOSE 8080 9080 1',

    'LABEL key=value',
    'LABEL key3=value\ three= key4="value four"',

    'MAINTAINER I\'m the maintainer',

    'ONBUILD ADD . /',
    'ONBUILD RUN /usr/local/bin/python-build --dir /app/src',

    'RUN /usr/local/bin/python-build --dir /app/src',
    'RUN apt-get update && apt-get install -y x11vnc xvfb firefox',

    'STOPSIGNAL -1',
    'STOPSIGNAL 18',

    'USER daemon',

    'VOLUME ["/data"]',
    'VOLUME /var/log /var/db',

    'WORKDIR /',
    'WORKDIR /path\ to\ workdir/other\ path/here'
  ];
  var dockerFile = lines.join('\n');
  var commands = dockerfileParser.parse(dockerFile);

  t.equal(commands.length, lines.length);

  t.end();
});


tape('should parse a Dockerfile', function (t) {

  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/Dockerfile', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);

  var numCommands = 16;
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

  var label = commands[14];
  t.equal(label.name, 'LABEL', '15th command is LABEL');
  t.equal(Object.keys(label.args).length, 1, 'LABEL command has 1 key');
  t.equal(label.args['name'], 'Some Name', 'LABEL name check');

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


tape('multiline', function (t) {
  var lines = [
    'FROM busybox',
    'MAINTAINER "Docker \\',
    'IO <io@\\',
    'docker.com>"'
  ];
  var dockerFile = lines.join('\n');
  var commands = dockerfileParser.parse(dockerFile);

  t.equal(commands.length, 2);
  t.equal(commands[1].args, '"Docker IO <io@docker.com>"');

  t.end();
});


tape('escape parser directive', function (t) {
  var lines = [
    '#escape = `',
    '',
    'FROM image',
    'MAINTAINER foo@bar.com',
    'ENV GOPATH `',
    '\go',
    'MAINTAINER "Docker `',
    'IO <io@`',
    'docker.com>"'
  ];
  var dockerFile = lines.join('\n');

  var commands = dockerfileParser.parse(dockerFile);
  t.equal(commands.length, 4);
  t.deepEqual(commands[2].args, { GOPATH: 'go' });
  t.equal(commands[3].args, '"Docker IO <io@docker.com>"');

  // Try again, this time using the default escape directive.
  dockerFile = dockerFile.replace(/`/g, '\\');

  commands = dockerfileParser.parse(dockerFile);
  t.equal(commands.length, 4);
  t.deepEqual(commands[2].args, { GOPATH: 'go' });
  t.equal(commands[3].args, '"Docker IO <io@docker.com>"');

  t.end();
});


tape('correctly parses commands with question mark', function (t) {
  var lines = [
    'FROM cirrusci/wget',
    '',
    'RUN wget http://google.com?hello=world'
  ];
  var dockerFile = lines.join('\n');

  var commands = dockerfileParser.parse(dockerFile);
  t.equal(commands.length, 2);
  t.deepEqual(commands[1].args, 'wget http://google.com?hello=world');

  t.end();
});

tape('inline comments', function (t) {

  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/Dockerfile-with-inline-comment', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);

  t.equal(commands[1].lineno, 4,  'Line number should be 4');
  t.end();
});

tape('line numbers for files without whitespace before inline comments', function (t) {

  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/Dockerfile-with-inline-comment-no-ws', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);

  t.equal(commands[0].lineno, 1,  'Line number should be 1');
  t.equal(commands[1].lineno, 5,  'Line number should be 5');
  t.equal(commands[1].args, 'cd /srv/app &&     echo "foo" &&     make build2',  'Args should be correct');
  t.equal(commands[2].lineno, 6,  'Line number should be 6');
  t.end();
});

tape('line numbers line up for complex dockerfiles', function (t) {
  var dname = __dirname;
  var dockerFile = fs.readFileSync(dname + '/ComplexDockerfile', 'utf8');
  var commands = dockerfileParser.parse(dockerFile);
  t.equal(commands[0].lineno, 1,  'line number should be 1');
  t.equal(commands[1].lineno, 4,  'line number should be 4');
  t.equal(commands[2].lineno, 6,  'line number should be 6');
  t.equal(commands[3].lineno, 56, 'line number should be 56');
  t.equal(commands[4].lineno, 58, 'line number should be 58');
  t.equal(commands[5].lineno, 89, 'line number should be 89');
  t.end();
});
