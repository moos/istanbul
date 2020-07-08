/*
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */

var path = require('path'),
    util = require('util'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    TextReport = require('./text');

/**
 * a `Report` implementation that produces text output in a folder-level detailed table.
 *
 * Usage
 * -----
 *
 *      var report = require('istanbul').Report.create('text-folders');
 *
 * @class TextFolderReport
 * @extends TextReport
 * @module report
 * @constructor
 * @param {Object} opts - see TextReport
 */
function TextFolderReport(opts) {
    TextReport.call(this, opts);
    this.opts.rawMetrics = {};
    this.opts.file = 'folder-summary.json';
}

TextFolderReport.TYPE = 'text-folders';
util.inherits(TextFolderReport, TextReport);

TextReport.super_.mix(TextFolderReport, {

    node_type: 'dir',

    synopsis: function () {
        return 'text report that prints a coverage line for every /folder/, to console and as JSON file';
    },

    writeReport: function () {
      TextFolderReport.super_.prototype.writeReport.apply(this, arguments);

      if (this.opts.file) {
        mkdirp.sync(this.dir);
        fs.writeFileSync(path.join(this.dir, this.opts.file), JSON.stringify(this.opts.rawMetrics), 'utf8');
      }
    }
});

module.exports = TextFolderReport;
