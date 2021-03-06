/*
 Copyright (c) 2012, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */

var path = require('path'),
    mkdirp = require('mkdirp'),
    util = require('util'),
    fs = require('fs'),
    defaults = require('./common/defaults'),
    Report = require('./index'),
    TreeSummarizer = require('../util/tree-summarizer'),
    utils = require('../object-utils'),
    PCT_COLS = 9,
    MISSING_COL = 15,
    TAB_SIZE = 1,
    DELIM = ' |',
    COL_DELIM = '-|',
    SEP = path.sep || '/';

/**
 * a `Report` implementation that produces text output in a detailed table.
 *
 * Usage
 * -----
 *
 *      var report = require('istanbul').Report.create('text');
 *
 * @class TextReport
 * @extends Report
 * @module report
 * @constructor
 * @param {Object} opts optional
 * @param {String} [opts.dir] the directory in which to the text coverage report will be written, when writing to a file
 * @param {String} [opts.file] the filename for the report. When omitted, the report is written to console
 * @param {Number} [opts.maxCols] the max column width of the report. By default, the width of the report is adjusted based on the length of the paths
 *              to be reported.
 */
function TextReport(opts) {
    Report.call(this);
    opts = opts || {};
    this.opts = opts;
    this.dir = opts.dir || process.cwd();
    this.file = opts.file;
    this.summary = opts.summary;
    this.maxCols = opts.maxCols || 0;
    this.watermarks = opts.watermarks || defaults.watermarks();
}

TextReport.TYPE = 'text';
util.inherits(TextReport, Report);

function padding(num, ch) {
    var str = '',
        i;
    ch = ch || ' ';
    for (i = 0; i < num; i += 1) {
        str += ch;
    }
    return str;
}

function fill(str, width, right, tabs, clazz) {
    tabs = tabs || 0;
    str = String(str);

    var leadingSpaces = tabs * TAB_SIZE,
        remaining = width - leadingSpaces,
        leader = padding(leadingSpaces),
        fmtStr = '',
        fillStr,
        strlen = str.length;

    if (remaining > 0) {
        if (remaining >= strlen) {
            fillStr = padding(remaining - strlen);
            fmtStr = right ? fillStr + str : str + fillStr;
        } else {
            fmtStr = str.substring(strlen - remaining);
            fmtStr = '... ' + fmtStr.substring(4);
        }
    }

    fmtStr = defaults.colorize(fmtStr, clazz);
    return leader + fmtStr;
}

function formatName(name, maxCols, level, clazz) {
    return fill(name, maxCols, false, level, clazz);
}

function formatPct(pct, clazz, width) {
    return fill(pct, width || PCT_COLS, true, 0, clazz);
}

function nodeName(node) {
    return node.displayShortName() || 'All';
}

function tableHeader(maxNameCols, kind) {
    var elements = [],
      label = {file: 'File', dir: 'Directory'}[kind] || 'File';
    elements.push(formatName(label, maxNameCols, 0));
    elements.push(formatPct('% Stmts'));
    elements.push(formatPct('% Branch'));
    elements.push(formatPct('% Funcs'));
    elements.push(formatPct('% Lines'));
    if (kind !== 'dir') {
        elements.push(formatPct('Uncovered Lines', undefined, MISSING_COL));
    }
    return elements.join(' |') + ' |';
}

function collectMissingLines(kind, linesCovered) {
  var missingLines = [];

  if (kind !== 'file') {
      return [];
  }

  Object.keys(linesCovered).forEach(function (key) {
      if (!linesCovered[key]) {
          missingLines.push(key);
      }
  });

  return missingLines;
}

function addRawMetrics(collector, node, opts) {
  var name = nodeName(node),
    isDir = opts.kind === 'dir',
    metrics = isDir ? node.recursiveMetrics : node.metrics;

  delete metrics.linesCovered;
  collector[ name ] = metrics;
}

function tableRow(node, maxNameCols, level, opts) {
    var name = nodeName(node),
        watermarks = opts.watermarks,
        isDir = opts.kind === 'dir',
        metrics = isDir ? node.recursiveMetrics : node.metrics,
        statements = metrics.statements.pct,
        branches = metrics.branches.pct,
        functions = metrics.functions.pct,
        lines = metrics.lines.pct,
        missingLines = collectMissingLines(node.kind, metrics.linesCovered),
        elements = [];

    elements.push(formatName(name, maxNameCols, level, defaults.classFor('statements', metrics, watermarks)));
    elements.push(formatPct(statements, defaults.classFor('statements', metrics, watermarks)));
    elements.push(formatPct(branches, defaults.classFor('branches', metrics, watermarks)));
    elements.push(formatPct(functions, defaults.classFor('functions', metrics, watermarks)));
    elements.push(formatPct(lines, defaults.classFor('lines', metrics, watermarks)));
    if (!isDir) {
        elements.push(formatPct(missingLines.join(','), 'low', MISSING_COL));
    }

    return elements.join(DELIM) + DELIM;
}

function findNameWidth(node, level, last) {
    last = last || 0;
    level = level || 0;
    var idealWidth = TAB_SIZE * level + nodeName(node).length;
    if (idealWidth > last) {
        last = idealWidth;
    }
    node.children.forEach(function (child) {
        last = findNameWidth(child, level + 1, last);
    });
    return last;
}

function makeLine(nameWidth, kind) {
    var name = padding(nameWidth, '-'),
        pct = padding(PCT_COLS, '-'),
        elements = [];

    elements.push(name);
    elements.push(pct);
    elements.push(pct);
    elements.push(pct);
    elements.push(pct);
    if (kind !== 'dir') {
        elements.push(padding(MISSING_COL, '-'));
    }
    return elements.join(COL_DELIM) + COL_DELIM;
}

function walk(node, nameWidth, array, level, opts) {
    var kind = opts.kind,
        depthCheck = opts.depth < 1 || !node.name || node.name.split(SEP).length - 1 <= opts.depth,
        matchCheck = !opts.match || !node.name || node.name.indexOf(opts.match) > -1,
        typeCheck = !opts.kind || node.kind === kind,
        line;

    if (level === 0) {
        line = makeLine(nameWidth, kind);
        array.push(line);
        array.push(tableHeader(nameWidth, kind));
        array.push(line);
    } else {
        if (depthCheck && matchCheck && typeCheck) {
          array.push(tableRow(node, nameWidth, level, opts));

          if (opts.rawMetrics) {
              addRawMetrics(opts.rawMetrics, node, opts);
          }
        }
    }

    node.children.forEach(function (child) {
        walk(child, nameWidth, array, level + 1, opts);
    });

    if (level === 0) {
        array.push(line);
        array.push(tableRow(node, nameWidth, level, opts));
        array.push(line);
    }
}

Report.mix(TextReport, {

    synopsis: function () {
        return 'text report that prints a coverage line for every file, typically to console';
    },
    getDefaultConfig: function () {
        return { file: null, maxCols: 0 };
    },
    writeReport: function (collector /*, sync */) {
        var summarizer = new TreeSummarizer(),
            tree,
            root,
            nameWidth,
            statsWidth = 4 * (PCT_COLS + 2) + MISSING_COL,
            maxRemaining,
            strings = [],
            text;

        collector.files().forEach(function (key) {
            summarizer.addFileCoverageSummary(key, utils.summarizeFileCoverage(
                collector.fileCoverageFor(key)
            ));
        });
        tree = summarizer.getTreeSummary();
        root = tree.root;
        nameWidth = findNameWidth(root);
        if (this.maxCols > 0) {
            maxRemaining = this.maxCols - statsWidth - 2;
            if (nameWidth > maxRemaining) {
                nameWidth = maxRemaining;
            }
        }
        walk(root, nameWidth, strings, 0, {
            watermarks: this.watermarks,
            kind: this.node_type,
            depth: this.opts.depth,
            match: this.opts.match,
            rawMetrics: this.opts.rawMetrics
        });
        text = strings.join('\n') + '\n';

        if (this.file) {
            mkdirp.sync(this.dir);
            fs.writeFileSync(path.join(this.dir, this.file), text, 'utf8');
        } else {
            console.log(text);
        }
        this.emit('done');
    }
});

module.exports = TextReport;
