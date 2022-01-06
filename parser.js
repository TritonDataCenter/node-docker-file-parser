// parser.js

/**
 * This package implements a Dockerfile parser.
 *
 * This is a translation of the docker go parser at:
 * https://github.com/docker/docker/blob/master/builder/parser/parser.go
 */


var TOKEN_WHITESPACE        = RegExp(/[\t\v\f\r ]+/);
var TOKEN_LINE_CONTINUATION = RegExp(/\\[ \t]*$/);
var TOKEN_COMMENT           = RegExp(/^#.*$/);
var TOKEN_INLINE_COMMENT    = RegExp(/^[ \t]+#.*$/);
var TOKEN_ESCAPE_DIRECTIVE  = RegExp(/^#[ \t]*escape[ \t]*=[ \t]*(.).*$/);

var errDockerfileNotStringArray = new Error('When using JSON array syntax, '
                                + 'arrays must be comprised of strings only.');


function isSpace(s) {
    return s.match(/^\s$/);
}

// Escape special regular expression characters in the provided string.
function regexEscape(str) {
    return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
}

/**
 * Parsers are dispatch calls that parse a single unit of text into a cmd.args
 * object which contains the statement details. Dockerfiles have varied (but not
 * usually unique, see ONBUILD for a unique example) parsing rules per-command,
 * and these unify the processing in a way that makes it manageable.
 */

// Parse onbuild, could potentially be used for anything that represents a
// statement with sub-statements.
//
// ONBUILD RUN foo bar -> (onbuild (run foo bar))
//
function parseSubCommand(cmd) {
    var parseDetails = parseLine(cmd.rest, cmd.lineno);
    if (parseDetails.command) {
        cmd.args = parseDetails.command;
        return true;
    }
    cmd.error = 'Unhandled onbuild command: ' + cmd.rest;
    return false;
}

// Helper to parse words (i.e space delimited or quoted strings) in a statement.
// The quotes are preserved as part of this function and they are stripped later
// as part of processWords().
function parseWords(rest) {
    var S_inSpaces = 1;
    var S_inWord   = 2;
    var S_inQuote  = 3;

    var words = [];
    var phase = S_inSpaces;
    var word = '';
    var quote = '';
    var blankOK = false;
    var ch;
    var pos;

    for (pos = 0; pos <= rest.length; pos++) {
        if (pos != rest.length) {
            ch = rest[pos];
        }

        if (phase == S_inSpaces) { // Looking for start of word
            if (pos == rest.length) { // end of input
                break;
            }
            if (isSpace(ch)) { // skip spaces
                continue;
            }
            phase = S_inWord; // found it, fall thru
        }
        if ((phase == S_inWord || phase == S_inQuote) && (pos == rest.length)) {
            if (blankOK || word.length > 0) {
                words.push(word);
            }
            break;
        }
        if (phase == S_inWord) {
            if (isSpace(ch)) {
                phase = S_inSpaces;
                if (blankOK || word.length > 0) {
                    words.push(word);
                }
                word = '';
                blankOK = false;
                continue;
            }
            if (ch == '\'' || ch == '"') {
                quote = ch;
                blankOK = true;
                phase = S_inQuote;
            }
            if (ch == '\\') {
                if (pos+1 == rest.length) {
                    continue; // just skip \ at end
                }
                // If we're not quoted and we see a \, then always just
                // add \ plus the char to the word, even if the char
                // is a quote.
                word += ch;
                pos++;
                ch = rest[pos];
            }
            word += ch;
            continue;
        }
        if (phase == S_inQuote) {
            if (ch == quote) {
                phase = S_inWord;
            }
            // \ is special except for ' quotes - can't escape anything for '
            if (ch == '\\' && quote != '\'') {
                if (pos+1 == rest.length) {
                    phase = S_inWord;
                    continue; // just skip \ at end
                }
                word += ch;
                pos++;
                ch = rest[pos];
            }
            word += ch;
        }
    }

    return words;
}

// Parse environment like statements. Note that this does *not* handle
// variable interpolation, which will be handled in the evaluator.
function parseNameVal(cmd) {
    // This is kind of tricky because we need to support the old
    // variant:   KEY name value
    // as well as the new one:    KEY name=value ...
    // The trigger to know which one is being used will be whether we hit
    // a space or = first.  space ==> old, "=" ==> new
    var word;
    var words = parseWords(cmd.rest);

    cmd.args = {};

    if (words.length === 0) {
        cmd.error = 'No KEY name value, or KEY name=value arguments found';
        return false;
    }

    if (words[0].indexOf('=') == -1) {
        // Old format (KEY name value)
        var strs = cmd.rest.split(TOKEN_WHITESPACE);
        if (strs.length < 2) {
            cmd.error = cmd.name + ' must have two arguments, got ' + cmd.rest;
            return false;
        }

        // Convert to new style key:value map.
        cmd.args[strs[0]] = strs.slice(1).join(' ');

    } else {
        // New format (KEY name=value ...)
        var i;
        for (i = 0; i < words.length; i++) {
            word = words[i];
            if (word.indexOf('=') == -1) {
                cmd.error = 'Syntax error - can\'t find = in ' + word
                    + '. Must be of the form: name=value';
                return false;
            }
            var parts = word.split('=');
            cmd.args[parts[0]] = parts.slice(1).join('=');
        }
    }

    return true;
}

function parseEnv(cmd) {
    return parseNameVal(cmd);
}

function parseLabel(cmd) {
    return parseNameVal(cmd);
}

// Parses a statement containing one or more keyword definition(s) and/or
// value assignments, like `name1 name2= name3="" name4=value`.
// Note that this is a stricter format than the old format of assignment,
// allowed by parseNameVal(), in a way that this only allows assignment of the
// form `keyword=[<value>]` like  `name2=`, `name3=""`, and `name4=value` above.
// In addition, a keyword definition alone is of the form `keyword` like `name1`
// above. And the assignments `name2=` and `name3=""` are equivalent and
// assign an empty value to the respective keywords.
function parseNameOrNameVal(cmd) {
    cmd.args = parseWords(cmd.rest);
    return true;
}

// Parses a whitespace-delimited set of arguments. The result is a
// list of string arguments.
function parseStringsWhitespaceDelimited(cmd) {
    cmd.args = cmd.rest.split(TOKEN_WHITESPACE);
    return true;
}

// Just stores the raw string.
function parseString(cmd) {
    cmd.args = cmd.rest;
    return true;
}

// Converts to JSON array, returns true on success, false otherwise.
function parseJSON(cmd) {
    try {
        var json = JSON.parse(cmd.rest);
    } catch (e) {
        return false;
    }

    // Ensure it's an array.
    if (!Array.isArray(json)) {
        return false;
    }

    // Ensure every entry in the array is a string.
    if (!json.every(function (entry) {
        return typeof (entry) === 'string';
    })) {
        return false;
    }

    cmd.args = json;
    return true;
}

// Determines if the argument appears to be a JSON array. If so, passes to
// parseJSON; if not, quotes the result and returns a single string.
function parseJsonOrString(cmd) {
    if (parseJSON(cmd)) {
        return true;
    }
    return parseString(cmd);
}

// Determines if the argument appears to be a JSON array. If so, parses as JSON;
// if not, attempts to parse it as a whitespace delimited string.
function parseJsonOrList(cmd) {
    if (parseJSON(cmd)) {
        return true;
    }
    return parseStringsWhitespaceDelimited(cmd);
}

// Dispatch Table. see line_parsers.go for the parse functions.
// The command is parsed and mapped to the line parser. The line parser
// recieves the arguments but not the command, and returns an AST after
// reformulating the arguments according to the rules in the parser
// functions. Errors are propagated up by Parse() and the resulting AST can
// be incorporated directly into the existing AST as a next.
var commandParsers = {
    'ADD':        parseJsonOrList,
    'ARG':        parseNameOrNameVal,
    'CMD':        parseJsonOrString,
    'COPY':       parseJsonOrList,
    'ENTRYPOINT': parseJsonOrString,
    'ENV':        parseEnv,
    'EXPOSE':     parseStringsWhitespaceDelimited,
    'FROM':       parseString,
    'LABEL':      parseLabel,
    'MAINTAINER': parseString,
    'ONBUILD':    parseSubCommand,
    'RUN':        parseJsonOrString,
    'STOPSIGNAL': parseString,
    'USER':       parseString,
    'VOLUME':     parseJsonOrList,
    'WORKDIR':    parseString
};

function isComment(line) {
    return line.match(TOKEN_COMMENT);
}

// Takes a single line of text and parses out the cmd and rest,
// which are used for dispatching to more exact parsing functions.
function splitCommand(line) {
    // Make sure we get the same results irrespective of leading/trailing spaces
    var match = line.match(TOKEN_WHITESPACE);
    if (!match) {
        return { name: line.toUpperCase(), rest: '' };
    }
    var name = line.substr(0, match.index).toUpperCase();
    var rest = line.substr(match.index + match[0].length);

    return { name: name, rest: rest };
}

// parse a line and return the remainder.
function parseLine(line, lineno, options) {
    var command = null;
    var lineContinuationRegex = (options && options.lineContinuationRegex
        || TOKEN_LINE_CONTINUATION);

    line = line.trim();

    if (!line) {
        // Ignore empty lines
        return { command: null, remainder: '' };
    }

    if (isComment(line)) {
        // Handle comment lines.
        command = { name: 'COMMENT', args: line, lineno: lineno };
        return { command: command, remainder: '' };
    }

    if (line.match(lineContinuationRegex)) {
        // Line continues on next line.
        var remainder = line.replace(lineContinuationRegex, '', 'g');
        return { command: null, remainder: remainder };
    }

    command = splitCommand(line);
    command.lineno = lineno;

    var commandParserFn = commandParsers[command.name];
    if (!commandParserFn) {
        // Invalid Dockerfile instruction, but allow it and move on.
        // log.debug('Invalid Dockerfile command:', command.name);
        commandParserFn = parseString;
    }

    if (commandParserFn(command)) {
        // Successfully converted the arguments.
        command.raw = line;
        delete command.rest;
    }

    return { command: command, remainder: '' };
}

/**
 * Parse dockerfile contents string and returns the array of commands.
 *
 * Supported options:
 * {
 *    includeComments: false,     // Whether to include comment commands.
 * }
 *
 * Each commands is an object with these possible properties:
 * {
 *   name: 'ADD',                 // The name of the command
 *   args: [ '.', '/srv/app' ],   // Arguments (can be array, string or map)
 *   lineno: 5,                   // Line number in the contents string.
 *   error: null                  // Only if there was an error parsing command
 * }
 *
 * @param contents {String}  The dockerfile file content.
 * @param options  {Object}  Configurable parameters.
 * @returns        {Array}   Array of command entries - one for each line.
 */
function parse(contents, options) {
    var commands = [];
    var i;
    var line;
    var lineno;
    var lines = contents.split(/\r?\n/);
    var lookingForDirectives = true;
    var parseOptions = {};
    var parseResult;
    var regexMatch;
    var remainder = '';
    var includeComments = options && options['includeComments'];

    for (i = 0; i < lines.length; i++) {
        lineno = i + 1;
        var nextLine = lines[i];
        // remove inline RUN # comment see https://github.com/joyent/node-docker-file-parser/issues/8
        if (nextLine.match(TOKEN_INLINE_COMMENT)) {
            nextLine = "\\";
        }
        if (remainder) {
            line = remainder + nextLine;
        } else {
            line = nextLine;
        }

        if (lookingForDirectives) {
            // Handle the parser directive '# escape=<char>. Parser directives
            // must precede any builder instruction or other comments, and
            // cannot be repeated.
            regexMatch = line.match(TOKEN_ESCAPE_DIRECTIVE);
            if (regexMatch) {
                if (regexMatch[1] != '`' && regexMatch[1] != '\\') {
                    throw new Error('invalid ESCAPE "' + regexMatch[1]
                        + '". Must be ` or \\');
                }
                if (parseOptions.lineContinuationRegex) {
                    throw new Error(
                        'only one escape parser directive can be used');
                }
                parseOptions.lineContinuationRegex = RegExp(
                    regexEscape(regexMatch[1]) + '[ \t]*$');
                continue;
            }
        }
        // Once a comment, empty line or builder instruction has been processed,
        // Docker no longer looks for parser directives.
        lookingForDirectives = false;

        parseResult = parseLine(line, lineno, parseOptions);
        if (parseResult.command) {
            if (parseResult.command.name !== 'COMMENT' || includeComments) {
                commands.push(parseResult.command);
            }
        }
        remainder = parseResult.remainder;
    }

    return commands;
}


module.exports = {
    parse: parse
};
