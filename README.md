# Docker file parser

Parses a dockerfile contents string and returns the array of commands, keeping
the original file order.

# Usage

    var parser = require('docker-file-parser');
    var options = { includeComments: false };
    var contents = 'FROM ubuntu:latest\n'
                + 'ADD . /root\n'
                + 'RUN echo done\n';

    var commands = parser.parse(contents, options);

    commands.every(function (cmd) { console.log(cmd); });

## Options

 * `includeComments` Whether to include comment commands in the returned array.
   A comment will have the command name as 'COMMENT'.

## Command entries

Each returned command entry is an object with these properties:

 * `name` The capitalized name of the command, e.g. 'FROM'.
 * `args` Arguments for the command (can be array, string or map).
 * `lineno` Line number from the contents string.
 * `error` Only if there was an error parsing command.

Example:

    {
        name: 'ADD',
        args: [ '.', '/srv/app' ],
        lineno: 5
    }


# Notes

There are other docker file parse modules for JavaScript, like
`dockerfile-parse` and `dockerfile-parser`, this module differs in the follow
aspects:

* keeps the ordering of the commands (as they occur in the dockerfile)
* written from a translation of the docker parser.go
* properly handles character escaping and quoting, e.g. ENV myName="John Doe" myDog=Rex\ The\ Dog
* handles multi-line commands (i.e. have a line continuance '\' at the end)
* can optionally include the comments

