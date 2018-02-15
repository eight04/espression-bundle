var espression = (function (exports) {
'use strict';

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = Object.setPrototypeOf ||
    ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = Object.assign || function __assign(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
    }
    return t;
};

var StaticEval = /** @class */ (function () {
    function StaticEval(rules) {
        this.rules = rules;
        this.context = {};
        if (!rules)
            this.rules = {};
    }
    StaticEval.prototype.register = function (type, fn) {
        this.rules[type] = fn;
    };
    StaticEval.prototype.eval = function (expression, context) {
        var old = this.context;
        this.context = context || {};
        var ret = this._eval(expression);
        this.context = old;
        return ret;
    };
    StaticEval.prototype._eval = function (expression) {
        if (!(expression.type in this.rules))
            throw new Error('Unsupported expression type: ' + expression.type);
        return this.rules[expression.type].call(this, expression);
    };
    return StaticEval;
}());

var ParserContext = /** @class */ (function () {
    function ParserContext(e, parser) {
        this.e = e;
        this.parser = parser;
        this.hnd = [0, 0];
        this.sp = false;
        this.lt = false;
        this.i = 0;
    }
    Object.defineProperty(ParserContext.prototype, "pos", {
        get: function () { return this.i; },
        enumerable: true,
        configurable: true
    });
    ParserContext.prototype.rest = function () {
        return this.e.substr(this.i);
    };
    ParserContext.prototype.eof = function () {
        return this.i >= this.e.length;
    };
    ParserContext.prototype.gb = function (cant) {
        this.sp = this.lt = false;
        this.i += cant;
    };
    ParserContext.prototype.err = function (msg) {
        throw new Error((msg || 'Unexpected char') + ' ' + this.gtCh() + ' at position ' + this.i);
    };
    ParserContext.prototype.teIdSt = function () {
        var ch = this.gtCh(), c = this.parser.config.identifier.st;
        return c.re.test(ch) || this.gtCd() >= 0x80 && (!c.re2 || c.re2.test(ch));
    };
    ParserContext.prototype.teIdPt = function () {
        var ch = this.gtCh(), c = this.parser.config.identifier.pt;
        return c.re.test(ch) || this.gtCd() >= 0x80 && (!c.re2 || c.re2.test(ch));
    };
    ParserContext.prototype.gbCh = function () {
        this.sp = this.lt = false;
        return this.e.charAt(this.i++);
    };
    ParserContext.prototype.gbCd = function () {
        this.sp = this.lt = false;
        return this.e.charCodeAt(this.i++);
    };
    ParserContext.prototype.gtCh = function (offset) {
        return this.e.charAt(this.i + (offset || 0));
    };
    ParserContext.prototype.gtCd = function (offset) {
        return this.e.charCodeAt(this.i + (offset || 0));
    };
    ParserContext.prototype.teCh = function (ch) {
        return ch === this.e.charAt(this.i);
    };
    ParserContext.prototype.tyCh = function (ch) {
        if (!this.teCh(ch))
            return false;
        this.sp = this.lt = false;
        this.i++;
        return true;
    };
    ParserContext.prototype.gbSp = function () {
        var sp, lt;
        // space or tab
        // tslint:disable-next-line:no-conditional-assignment
        while ((sp = this.teSP()) || (lt = this.teLT())) {
            this.i++;
            this.sp = this.sp || sp;
            this.lt = this.lt || lt;
        }
        return this.sp || this.lt;
    };
    ParserContext.prototype.teSP = function (offset) {
        var ch = this.gtCd(offset);
        return ch === 32 || ch === 9;
    };
    ParserContext.prototype.teLT = function (offset) {
        var ch = this.gtCd(offset);
        return ch === 10 || ch === 13;
    };
    ParserContext.prototype.gbHex = function (prefix) {
        var len = (prefix === 'u') ? 4 : 2;
        var code = 0, digit;
        var hexDigit = '0123456789abcdef';
        for (var i = 0; i < len; ++i) {
            digit = hexDigit.indexOf(this.gtCh().toLowerCase());
            if (!this.eof() && digit >= 0) {
                this.i++;
                code = code * 16 + digit;
            }
            else
                return null;
        }
        return String.fromCharCode(code);
    };
    ParserContext.prototype.gtOp = function (type) {
        var ops = this.parser.ops[type];
        if (!ops)
            return null;
        var toCheck = this.e.substr(this.i, ops.maxLen), tcLen = toCheck.length;
        while (tcLen > 0) {
            if (toCheck in ops.ops) {
                if (!ops.ops[toCheck] || this.teSP(tcLen) || this.teLT(tcLen)) {
                    return toCheck;
                }
            }
            toCheck = toCheck.substr(0, --tcLen);
        }
        return null;
    };
    ParserContext.prototype.handleUp = function () {
        return this.parser.runRules(this, [this.hnd[0], this.hnd[1] + 1]);
    };
    ParserContext.prototype.recurse = function () {
        return this.parser.runRules(this, this.hnd);
    };
    ParserContext.prototype.handler = function (level) {
        return this.parser.runRules(this, level);
    };
    return ParserContext;
}());

var Parser = /** @class */ (function () {
    function Parser(rules, config) {
        this.rules = rules;
        this.ops = {};
        this.config = {
            identifier: {
                st: { re: /[$_A-Za-z]/ },
                pt: { re: /[$_0-9A-Za-z]/ }
            }
        };
        if (!rules || !rules.length)
            throw new Error('Must provide rules');
        this.config = __assign({}, this.config, config);
        for (var _i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
            var type = rules_1[_i];
            for (var _a = 0, type_1 = type; _a < type_1.length; _a++) {
                var rule = type_1[_a];
                rule.register(this);
            }
        }
    }
    Parser.prototype.registerOp = function (type, op, space) {
        if (!(type in this.ops))
            this.ops[type] = { maxLen: 0, ops: {} };
        if (op in this.ops[type])
            throw new Error('Duplicated rule for operator ' + op);
        this.ops[type].ops[op] = space;
        this.ops[type].maxLen = Math.max(this.ops[type].maxLen, op.length);
    };
    Parser.prototype.parse = function (expr) {
        var ctx, origParser;
        if (typeof expr === 'string') {
            ctx = new ParserContext(expr, this);
        }
        else {
            origParser = expr.parser;
            expr.parser = this;
            ctx = expr;
        }
        var node = this.runRules(ctx, [0, 0]);
        if (origParser) {
            ctx.parser = origParser;
        }
        else {
            ctx.gbSp();
            if (!ctx.eof())
                ctx.err();
        }
        return node;
    };
    Parser.prototype.runRules = function (ctx, _a) {
        var type = _a[0], from = _a[1];
        var r = this.rules, oldHnd = ctx.hnd;
        if (from >= r[type].length) {
            type++;
            from = 0;
        }
        if (type >= r.length)
            return null;
        var res = null, pre;
        if (type < r.length - 1) {
            ctx.hnd = [type, from];
            pre = r[type][from].pre(ctx);
            if (pre.final) {
                if (!pre.node)
                    ctx.err();
                res = pre.node;
            }
            else {
                res = this.runRules(ctx, [type, from + 1]);
            }
            if (!pre.skip) {
                ctx.gbSp();
                res = r[type][from].post(ctx, pre.node, res);
            }
        }
        else {
            ctx.gbSp();
            for (var i = from; i < r[type].length; i++) {
                ctx.hnd = [type, i];
                pre = r[type][i].pre(ctx);
                if (pre && pre.node)
                    break;
            }
            res = pre && pre.node;
        }
        ctx.hnd = oldHnd;
        return res;
    };
    return Parser;
}());
var BaseRule = /** @class */ (function () {
    function BaseRule() {
        this.config = {};
    }
    // tslint:disable-next-line:no-empty
    BaseRule.prototype.register = function (parser) {
    };
    BaseRule.prototype.pre = function (ctx) {
        return { node: null };
    };
    BaseRule.prototype.post = function (ctx, preNode, bubbledNode) {
        return bubbledNode;
    };
    return BaseRule;
}());

// shared binary operators configurations
var BINARY_EXP = 'BinaryExpression';
var LOGICAL_EXP = 'LogicalExpression';
var ASSIGN_EXP = 'AssignmentExpression';
var LITERAL_EXP = 'Literal';
var IDENTIFIER_EXP = 'Identifier';
var THIS_EXP = 'ThisExpression';
var ARRAY_EXP = 'ArrayExpression';
var OBJECT_EXP = 'ObjectExpression';
var MEMBER_EXP = 'MemberExpression';
var CALL_EXP = 'CallExpression';
var CONDITIONAL_EXP = 'ConditionalExpression';
var SEQUENCE_EXP = 'SequenceExpression';
var UPDATE_EXP = 'UpdateExpression';
var UNARY_EXP = 'UnaryExpression';
var BINARY_TYPE = { type: BINARY_EXP };
var BINARY_TYPE_SP = { type: BINARY_EXP, space: true };
var LOGICAL_TYPE = { type: LOGICAL_EXP };
var ASSIGN_TYPE = { type: ASSIGN_EXP, ltypes: [IDENTIFIER_EXP, MEMBER_EXP] };
var UNARY_TYPE = { type: UNARY_EXP };
var UNARY_TYPE_SP = { type: UNARY_EXP, space: true };
var UPDATE_TYPE = { type: UPDATE_EXP, types: [IDENTIFIER_EXP, MEMBER_EXP] };
var es5BiOpConfs = [
    { '||': LOGICAL_TYPE },
    { '&&': LOGICAL_TYPE },
    { '|': BINARY_TYPE },
    { '^': BINARY_TYPE },
    { '&': BINARY_TYPE },
    {
        '==': BINARY_TYPE,
        '!=': BINARY_TYPE,
        '===': BINARY_TYPE,
        '!==': BINARY_TYPE
    }, {
        '<': BINARY_TYPE,
        '>': BINARY_TYPE,
        '<=': BINARY_TYPE,
        '>=': BINARY_TYPE,
        'instanceof': BINARY_TYPE_SP,
        'in': BINARY_TYPE_SP
    }, {
        '<<': BINARY_TYPE,
        '>>': BINARY_TYPE,
        '>>>': BINARY_TYPE
    }, {
        '+': BINARY_TYPE,
        '-': BINARY_TYPE
    }, {
        '*': BINARY_TYPE,
        '/': BINARY_TYPE,
        '%': BINARY_TYPE
    }
];
var es5AssignOpConf = {
    '=': ASSIGN_TYPE,
    '+=': ASSIGN_TYPE,
    '-=': ASSIGN_TYPE,
    '*=': ASSIGN_TYPE,
    '/=': ASSIGN_TYPE,
    '%=': ASSIGN_TYPE,
    '<<=': ASSIGN_TYPE,
    '>>=': ASSIGN_TYPE,
    '>>>=': ASSIGN_TYPE,
    '|=': ASSIGN_TYPE,
    '&=': ASSIGN_TYPE,
    '^=': ASSIGN_TYPE
};
// member conf needs configuration of '.' operator
function es5MemberConf(memberRule) {
    return {
        '.': {
            type: MEMBER_EXP,
            extra: { computed: false },
            noop: true,
            left: 'object', right: 'property',
            rules: memberRule
        },
        '(': {
            type: CALL_EXP,
            left: 'callee', right: 'arguments',
            multi: ',', close: ')', empty: true,
            level: 2,
            noop: true
        },
        '[': {
            type: MEMBER_EXP,
            left: 'object', right: 'property',
            extra: { computed: true },
            close: ']',
            level: 1,
            noop: true
        }
    };
}
// shared unary operatos configurations
var es5PreUnaryOp = [
    {
        '-': UNARY_TYPE,
        '+': UNARY_TYPE,
        '!': UNARY_TYPE,
        '~': UNARY_TYPE
    }, {
        'typeof': UNARY_TYPE_SP,
        'void': UNARY_TYPE_SP,
        'delete': UNARY_TYPE_SP
    }, {
        '--': UPDATE_TYPE,
        '++': UPDATE_TYPE
    }
];
var es5PostUnaryOpConf = {
    pre: false,
    op: {
        '--': UPDATE_TYPE,
        '++': UPDATE_TYPE
    }
};
// multiple operator configurations
var es5CommaOpConf = {
    type: SEQUENCE_EXP,
    prop: 'expressions', separator: ','
};
// ternary operator configurations
var es5ConditionalConf = {
    type: CONDITIONAL_EXP,
    firstOp: '?', secondOp: ':',
    left: 'test', middle: 'consequent', right: 'alternate'
};
// basic rules
var es5ArrayConf = { type: ARRAY_EXP, level: 2 };
var es5GroupingConf = { open: '(', close: ')', level: 1 };
var identStartConf = {
    re: /[$_A-Za-z]/,
    re2: /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/
};
var identPartConf = {
    re: /[$_0-9A-Za-z]/,
    re2: /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0\u08A2-\u08AC\u08E4-\u08FE\u0900-\u0963\u0966-\u096F\u0971-\u0977\u0979-\u097F\u0981-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C01-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C82\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D02\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191C\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1D00-\u1DE6\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA697\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7B\uAA80-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE26\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/
};
function es5IdentifierConf(identifier) {
    if (identifier === void 0) { identifier = null; }
    return {
        literals: {
            'true': true,
            'false': false,
            'null': null
        },
        thisStr: 'this',
        identifier: identifier
    };
}

var MultiOperatorRule = /** @class */ (function (_super) {
    __extends(MultiOperatorRule, _super);
    function MultiOperatorRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        config.extra = config.extra || {};
        return _this;
    }
    MultiOperatorRule.prototype.post = function (ctx, preNode, bubbledNode) {
        var c = this.config;
        var nodes = [], ch, sep = 0;
        if (bubbledNode)
            nodes.push(bubbledNode);
        while (!ctx.eof() && (!c.maxSep || sep < c.maxSep)) {
            ctx.gbSp();
            ch = ctx.gtCh();
            if (c.separator.indexOf(ch) >= 0) {
                ctx.gbCh();
                if ('empty' in c && !bubbledNode && c.empty !== true)
                    nodes.push(c.empty);
            }
            else if (!(ctx.sp && c.sp || c.lt && (ctx.lt || ctx.eof()) || bubbledNode && c.implicit))
                break;
            sep++;
            bubbledNode = ctx.handleUp();
            if (bubbledNode)
                nodes.push(bubbledNode);
        }
        // it is not a multi operator, pass thru
        if (!sep && !(c.lt && ctx.eof()))
            return bubbledNode;
        if (nodes.length < sep + 1 && !('empty' in c))
            ctx.err();
        var ret = __assign((_a = { type: c.type }, _a[c.prop] = nodes, _a), c.extra);
        return nodes.length === 1 && c.single ? nodes[0] : ret;
        var _a;
    };
    return MultiOperatorRule;
}(BaseRule));

var TernaryOperatorRule = /** @class */ (function (_super) {
    __extends(TernaryOperatorRule, _super);
    function TernaryOperatorRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        return _this;
    }
    TernaryOperatorRule.prototype.post = function (ctx, preNode, bubbledNode) {
        var c = this.config;
        ctx.gbSp();
        if (!ctx.tyCh(c.firstOp))
            return bubbledNode;
        var consequent = ctx.recurse();
        ctx.gbSp();
        if (!ctx.tyCh(c.secondOp) || !consequent)
            ctx.err();
        var alternate = ctx.recurse();
        if (!alternate)
            ctx.err();
        var node = { type: c.type };
        node[c.left] = bubbledNode;
        node[c.middle] = consequent;
        node[c.right] = alternate;
        return node;
    };
    return TernaryOperatorRule;
}(BaseRule));

var BinaryOperatorRule = /** @class */ (function (_super) {
    __extends(BinaryOperatorRule, _super);
    function BinaryOperatorRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        _this.maxLen = 0;
        var c;
        for (var op in config) {
            c = config[op];
            _this.maxLen = Math.max(op.length, _this.maxLen);
            c.left = c.left || 'left';
            c.right = c.right || 'right';
            c.empty = c.close && c.empty || false;
            c.multi = c.close && c.multi || '';
            if (c.rules && !c.parser)
                c.parser = new Parser(c.rules);
        }
        return _this;
    }
    BinaryOperatorRule.prototype.register = function (parser) {
        for (var op in this.config) {
            parser.registerOp('binary', op, this.config[op].space);
        }
    };
    BinaryOperatorRule.prototype.post = function (ctx, preNode, bubbledNode) {
        var right, multi = [], node, nxt = false, op = this.gbOp(ctx), c = this.config[op];
        if (!op || !bubbledNode)
            return bubbledNode;
        do {
            do {
                if (c.ltypes && c.ltypes.indexOf(bubbledNode.type) < 0)
                    ctx.err('Invalid left-hand side');
                if (c.parser)
                    right = c.parser.parse(ctx);
                else if (c.level)
                    right = ctx.handler([c.level, 0]);
                else if (c.rasoc)
                    right = ctx.recurse();
                else
                    right = ctx.handleUp();
                if (!right && !c.empty)
                    ctx.err('Missing right opperand. Found');
                ctx.gbSp();
                if (right && c.multi)
                    multi.push(right);
                // tslint:disable-next-line:no-conditional-assignment
                if (!(nxt = c.multi && right && ctx.tyCh(c.multi)) && c.close && !ctx.tyCh(c.close))
                    ctx.err();
            } while (nxt);
            node = { type: c.type };
            if (!c.noop)
                node.operator = op;
            node[c.left] = bubbledNode;
            node[c.right] = c.multi ? multi : right;
            // tslint:disable-next-line:whitespace
            if (c.extra)
                node = __assign({}, node, c.extra);
            // tslint:disable-next-line:no-conditional-assignment
            if (!c.rasoc && (op = this.gbOp(ctx))) {
                bubbledNode = node;
                c = this.config[op];
            }
            else
                break;
        } while (1);
        return node;
    };
    BinaryOperatorRule.prototype.gbOp = function (ctx) {
        ctx.gbSp();
        var op = ctx.gtOp('binary');
        if (op in this.config) {
            ctx.gb(op.length);
            return op;
        }
        return null;
    };
    return BinaryOperatorRule;
}(BaseRule));

var UnaryOperatorRule = /** @class */ (function (_super) {
    __extends(UnaryOperatorRule, _super);
    function UnaryOperatorRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        _this.maxLen = 0;
        for (var op in config) {
            if (config.hasOwnProperty(op))
                _this.maxLen = op.length > _this.maxLen ? op.length : _this.maxLen;
        }
        return _this;
    }
    UnaryOperatorRule.prototype.register = function (parser) {
        for (var op in this.config.op) {
            if (!this.config.op.hasOwnProperty(op))
                continue;
            parser.registerOp('unary', op, this.config.op[op].space);
        }
    };
    UnaryOperatorRule.prototype.pre = function (ctx) {
        var c = this.config;
        if (!c.pre)
            return { node: null };
        var op = this.gobOperator(ctx);
        if (!op)
            return { skip: true, node: null };
        return {
            node: {
                type: c.op[op].type,
                operator: op,
                prefix: true
            }
        };
    };
    UnaryOperatorRule.prototype.post = function (ctx, pre, node) {
        if (pre && !node)
            ctx.err();
        if (!pre) {
            var op = this.gobOperator(ctx);
            if (!op)
                return node;
            pre = {
                type: this.config.op[op].type,
                operator: op,
                prefix: false
            };
        }
        pre.argument = node;
        var types = this.config.op[pre.operator].types;
        if (types && types.indexOf(node.type) < 0)
            ctx.err('Invalid argument type');
        return pre;
    };
    UnaryOperatorRule.prototype.gobOperator = function (ctx) {
        ctx.gbSp();
        var op = ctx.gtOp('unary');
        if (this.config.op.hasOwnProperty(op)) {
            ctx.gb(op.length);
            return op;
        }
        return null;
    };
    return UnaryOperatorRule;
}(BaseRule));

var GroupingOperatorRule = /** @class */ (function (_super) {
    __extends(GroupingOperatorRule, _super);
    function GroupingOperatorRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        _this.level = 0;
        if (typeof config.level === 'number')
            _this.level = config.level;
        else
            _this.parser = new Parser(config.rules);
        return _this;
    }
    GroupingOperatorRule.prototype.register = function (parser) {
        parser.registerOp('group', this.config.open, false);
    };
    GroupingOperatorRule.prototype.pre = function (ctx) {
        var c = this.config;
        var node;
        ctx.gbSp();
        if (ctx.gtOp('group') !== c.open)
            return { node: null };
        ctx.gb(c.open.length);
        if (this.parser)
            node = this.parser.parse(ctx);
        else
            node = ctx.handler([this.level, 0]);
        if (!node)
            ctx.err();
        ctx.gbSp();
        if (!ctx.tyCh(c.close))
            ctx.err();
        if (c.type && c.prop) {
            node = (_a = {
                    type: c.type
                }, _a[c.prop] = node, _a);
        }
        return {
            final: true,
            node: node
        };
        var _a;
    };
    return GroupingOperatorRule;
}(BaseRule));

var StringRule = /** @class */ (function (_super) {
    __extends(StringRule, _super);
    function StringRule(config) {
        if (config === void 0) { config = { LT: true, hex: true, raw: true }; }
        var _this = _super.call(this) || this;
        _this.config = config;
        return _this;
    }
    StringRule.prototype.pre = function (ctx) {
        var c = this.config;
        var str = '', quote, closed = false, ch, start = ctx.pos;
        ch = ctx.gtCh();
        if (ch !== '"' && ch !== "'")
            return { node: null };
        quote = ctx.gbCh();
        while (!ctx.eof()) {
            ch = ctx.gbCh();
            if (ch === quote) {
                closed = true;
                break;
            }
            else if (ch === '\\') {
                if (c.LT && ctx.teLT()) {
                    // check for line continuation
                    ch = ctx.gbCh();
                    if (ch === '\r')
                        ctx.tyCh('\n');
                }
                else {
                    ch = ctx.gbCh();
                    switch (ch) {
                        // check for common escapes
                        case 'n':
                            str += '\n';
                            break;
                        case 'r':
                            str += '\r';
                            break;
                        case 't':
                            str += '\t';
                            break;
                        case 'b':
                            str += '\b';
                            break;
                        case 'f':
                            str += '\f';
                            break;
                        case 'v':
                            str += '\x0B';
                            break;
                        // check for hex
                        case 'u':
                        case 'x':
                            if (c.hex) {
                                ch = ctx.gbHex(ch);
                                if (ch === null)
                                    ctx.err('Invalid Hex Escape');
                            }
                            str += ch;
                            break;
                        default: str += ch;
                    }
                }
            }
            else if (c.LT && ctx.teLT(-1)) {
                ctx.err('Invalid line terminator in string');
            }
            else {
                str += ch;
            }
        }
        if (!closed) {
            ctx.err('Unclosed quote after ');
        }
        return {
            node: {
                type: LITERAL_EXP,
                value: str,
                raw: c.raw ? ctx.e.substring(start, ctx.pos) : quote + str + quote
            }
        };
    };
    return StringRule;
}(BaseRule));

var NumberRule = /** @class */ (function (_super) {
    __extends(NumberRule, _super);
    function NumberRule(config) {
        if (config === void 0) { config = { radix: 10, prefix: null, int: false, noexp: false }; }
        var _this = _super.call(this) || this;
        _this.config = config;
        if (config.radix < 2 || config.radix > 36)
            throw new Error('Radix out of range');
        var digits = '0-' + (config.radix < 10 ? config.radix - 1 : 9);
        if (config.radix > 10)
            digits += 'A-' + String.fromCharCode(64 + config.radix - 10);
        if (config.radix !== 10) {
            config.int = true;
            config.noexp = true;
        }
        _this.digits = new RegExp('[' + digits + ']', 'i');
        return _this;
    }
    NumberRule.prototype.pre = function (ctx) {
        var c = this.config;
        var num = '', ch, prefix = '';
        if (c.prefix) {
            var m = c.prefix.exec(ctx.rest());
            if (!m)
                return null;
            prefix = m[0];
            ctx.gb(prefix.length);
        }
        while (this.digits.test(ctx.gtCh())) {
            num += ctx.gbCh();
        }
        if (!c.int && ctx.gtCh() === '.') {
            num += ctx.gbCh();
            while (this.digits.test(ctx.gtCh())) {
                num += ctx.gbCh();
            }
        }
        if ((!num || num === '.') && !prefix) {
            ctx.gb(-num.length);
            return { node: null };
        }
        ch = ctx.gtCh();
        if (!c.noexp && (ch === 'e' || ch === 'E')) {
            num += ctx.gbCh();
            ch = ctx.gtCh();
            if (ch === '+' || ch === '-') {
                num += ctx.gbCh();
            }
            while (this.digits.test(ctx.gtCh())) {
                num += ctx.gbCh();
            }
            if (!this.digits.test(ctx.gtCh(-1))) {
                ctx.err('Expected exponent (' + num + ctx.gtCh() + ')');
            }
        }
        if (!num.length)
            ctx.err('Invalid number format');
        if (ctx.teIdSt())
            ctx.err();
        return {
            node: {
                type: LITERAL_EXP,
                value: c.int ? parseInt(num, c.radix) : parseFloat(num),
                raw: prefix + num
            }
        };
    };
    return NumberRule;
}(BaseRule));

// Gobbles only identifiers
// e.g.: `foo`, `_value`, `$x1`
// Also, this function checks if that identifier is a literal:
// (e.g. `true`, `false`, `null`) or `this`
var IdentifierRule = /** @class */ (function (_super) {
    __extends(IdentifierRule, _super);
    function IdentifierRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        return _this;
    }
    IdentifierRule.prototype.register = function (parser) {
        var c = this.config.identifier, g = parser.config.identifier;
        if (c) {
            if (c.st)
                g.st = __assign({}, g.st, c.st);
            if (c.pt)
                g.pt = __assign({}, g.pt, c.pt);
        }
    };
    IdentifierRule.prototype.pre = function (ctx) {
        var c = this.config;
        var identifier;
        if (!ctx.teIdSt())
            return { node: null };
        identifier = ctx.gbCh();
        while (!ctx.eof()) {
            ctx.gtCh();
            if (!ctx.teIdPt())
                break;
            identifier += ctx.gbCh();
        }
        if (c.literals.hasOwnProperty(identifier)) {
            return {
                node: {
                    type: LITERAL_EXP,
                    value: c.literals[identifier],
                    raw: identifier
                }
            };
        }
        else if (identifier === c.thisStr) {
            return { node: { type: THIS_EXP } };
        }
        else {
            return {
                node: {
                    type: IDENTIFIER_EXP,
                    name: identifier
                }
            };
        }
    };
    return IdentifierRule;
}(BaseRule));

var ArrayRule = /** @class */ (function (_super) {
    __extends(ArrayRule, _super);
    function ArrayRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        return _this;
    }
    ArrayRule.prototype.pre = function (ctx) {
        var right, multi = [], i = 0, comma;
        if (!ctx.tyCh('['))
            return { node: null };
        var c = this.config;
        do {
            if (c.parser)
                right = c.parser.parse(ctx);
            else
                right = ctx.handler([c.level, 0]);
            ctx.gbSp();
            // tslint:disable-next-line:no-conditional-assignment
            if ((comma = ctx.tyCh(',')) || right)
                multi[i] = right;
            i++;
        } while (comma);
        if (!ctx.tyCh(']'))
            ctx.err();
        return {
            node: {
                type: c.type,
                elements: multi
            }
        };
    };
    return ArrayRule;
}(BaseRule));

var WrapperRule = /** @class */ (function (_super) {
    __extends(WrapperRule, _super);
    function WrapperRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        return _this;
    }
    WrapperRule.prototype.post = function (ctx, preNode, bubbledNode) {
        var c = this.config;
        var node = { type: c.type };
        node[c.wrap] = bubbledNode;
        if (bubbledNode && bubbledNode.type === LITERAL_EXP && typeof bubbledNode.value === 'string')
            node['directive'] = bubbledNode.raw.substring(1, bubbledNode.raw.length - 1);
        return bubbledNode ? node : null;
    };
    return WrapperRule;
}(BaseRule));

// Error strings
var UNTERMINATED_ERROR = 'Unterminated Regular Expression';
var RegexRule = /** @class */ (function (_super) {
    __extends(RegexRule, _super);
    function RegexRule() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    RegexRule.prototype.pre = function (ctx) {
        var start = ctx.pos;
        // Regular expression literal must start with a slash
        if (!ctx.tyCh('/'))
            return null;
        var ch, pattern = '', bracket = false, closed = false;
        var flags = '', value;
        // parse regex pattern
        while (!ctx.eof()) {
            pattern += ch = ctx.gbCh();
            if (ch === '\\') {
                if (ctx.teLT())
                    ctx.err(UNTERMINATED_ERROR);
                pattern += ctx.gbCh();
            }
            else if (ctx.teLT())
                ctx.err(UNTERMINATED_ERROR);
            else if (bracket) {
                if (ch === ']')
                    bracket = false;
            }
            else if (ch === '/') {
                closed = true;
                break;
            }
            else if (ch === '[')
                bracket = true;
        }
        if (!closed)
            ctx.err(UNTERMINATED_ERROR);
        // remove trailing slash.
        pattern = pattern.substr(0, pattern.length - 1);
        // scan regex flags
        while (!ctx.eof() && ctx.teIdPt()) {
            flags = ctx.gbCh();
        }
        try {
            value = new RegExp(pattern, flags);
        }
        catch (e) {
            ctx.err(e.message);
        }
        return {
            node: {
                type: LITERAL_EXP,
                value: value,
                raw: ctx.e.substring(start, ctx.pos),
                regex: {
                    pattern: pattern,
                    flags: flags
                }
            }
        };
    };
    return RegexRule;
}(BaseRule));

var ObjectRule = /** @class */ (function (_super) {
    __extends(ObjectRule, _super);
    function ObjectRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        if (config.key.rules)
            _this.keyParser = new Parser(config.key.rules);
        if (config.value.rules)
            _this.valueParser = new Parser(config.value.rules);
        return _this;
    }
    ObjectRule.prototype.pre = function (ctx) {
        var c = this.config;
        var key, value, properties = [];
        // object literal must start with '{'
        if (!ctx.tyCh('{'))
            return null;
        ctx.gbSp();
        while (!ctx.tyCh('}')) {
            if (ctx.eof())
                ctx.err('Unterminated Object Expression');
            key = this.keyParser ? this.keyParser.parse(ctx) : ctx.handler([c.key.level, 0]);
            if (!key)
                ctx.err('Invalid property');
            ctx.gbSp();
            if (!ctx.tyCh(':'))
                ctx.err();
            ctx.gbSp();
            value = this.valueParser ? this.valueParser.parse(ctx) : ctx.handler([c.value.level, 0]);
            ctx.gbSp();
            if (ctx.gtCh() !== '}') {
                if (!ctx.tyCh(','))
                    ctx.err();
                ctx.gbSp();
            }
            properties.push({
                type: 'Property',
                key: key,
                value: value,
                kind: 'init',
                method: false,
                computed: false,
                shorthand: false
            });
        }
        return {
            node: {
                type: OBJECT_EXP,
                properties: properties
            }
        };
    };
    return ObjectRule;
}(BaseRule));

var esprimaStatementConf = {
    type: 'Program',
    prop: 'body', extra: { sourceType: 'script' },
    separator: ';', sp: false, lt: true,
    empty: { type: 'EmptyStatement' }
};
function es5Rules(identifier) {
    if (identifier === void 0) { identifier = { st: identStartConf, pt: identPartConf }; }
    // basic tokens used also in parsing objet literal's properties
    var tokenRules = [
        new StringRule({ LT: true, hex: true, raw: true }),
        new NumberRule({ radix: 16, prefix: /^0x/i }),
        new NumberRule({ radix: 8, prefix: /^0o/i }),
        new NumberRule({ radix: 2, prefix: /^0b/i }),
        new NumberRule()
    ];
    // properties can have reserved words as names
    var PropertyRule = new IdentifierRule({ thisStr: null, literals: {} });
    // object needs subset of tokens for parsing properties.
    tokenRules = tokenRules.concat([
        new IdentifierRule(es5IdentifierConf(identifier)),
        new ArrayRule(es5ArrayConf),
        new RegexRule(),
        new ObjectRule({
            key: { rules: [tokenRules.concat(PropertyRule)] },
            value: { level: 2 }
        })
    ]);
    return [
        [
            new MultiOperatorRule(esprimaStatementConf),
            new WrapperRule({ type: 'ExpressionStatement', wrap: 'expression' })
        ],
        [new MultiOperatorRule(es5CommaOpConf)],
        [new BinaryOperatorRule(es5AssignOpConf)],
        [new TernaryOperatorRule(es5ConditionalConf)],
        es5BiOpConfs.map(function (conf) { return new BinaryOperatorRule(conf); }),
        [
            new UnaryOperatorRule({ pre: true, op: __assign({}, es5PreUnaryOp[0], es5PreUnaryOp[1], es5PreUnaryOp[2]) }),
            new UnaryOperatorRule(es5PostUnaryOpConf),
            new BinaryOperatorRule(es5MemberConf([[PropertyRule]])),
            new GroupingOperatorRule(es5GroupingConf)
        ],
        tokenRules
    ];
}
function es5ParserFactory() {
    return new Parser(es5Rules());
}

// Gobbles only identifiers
// e.g.: `foo`, `_value`, `$x1`
// Also, this function checks if that identifier is a literal:
// (e.g. `true`, `false`, `null`) or `this`
var LiteralRule = /** @class */ (function (_super) {
    __extends(LiteralRule, _super);
    function LiteralRule(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        return _this;
    }
    LiteralRule.prototype.pre = function (ctx) {
        var c = this.config;
        var identifier, node;
        if (!ctx.teIdSt() && (!c.start || c.start.indexOf(ctx.gtCh()) < 0))
            return { node: null };
        identifier = ctx.gbCh();
        while (!ctx.eof()) {
            if (!ctx.teIdPt() && (!c.part || c.part.indexOf(ctx.gtCh()) < 0))
                break;
            identifier += ctx.gbCh();
        }
        node = { type: c.type };
        if (c.prop)
            node[c.prop] = identifier;
        if (c.literals) {
            if (c.literals.hasOwnProperty(identifier)) {
                if (c.value)
                    node[c.value] = c.literals[identifier];
            }
            else
                return null;
        }
        return { node: node };
    };
    return LiteralRule;
}(BaseRule));

var binaryOpCB = {
    '||': function (a, b) { return a || b; },
    '&&': function (a, b) { return a && b; },
    '|': function (a, b) { return a | b; },
    '^': function (a, b) { return a ^ b; },
    '&': function (a, b) { return a & b; },
    '==': function (a, b) { return a == b; },
    '!=': function (a, b) { return a != b; },
    '===': function (a, b) { return a === b; },
    '!==': function (a, b) { return a !== b; },
    '<': function (a, b) { return a < b; },
    '>': function (a, b) { return a > b; },
    '<=': function (a, b) { return a <= b; },
    '>=': function (a, b) { return a || b; },
    'instanceof': function (a, b) { return a instanceof b; },
    'in': function (a, b) { return a in b; },
    '<<': function (a, b) { return a << b; },
    '>>': function (a, b) { return a >> b; },
    '>>>': function (a, b) { return a >>> b; },
    '+': function (a, b) { return a + b; },
    '-': function (a, b) { return a - b; },
    '*': function (a, b) { return a * b; },
    '/': function (a, b) { return a / b; },
    '%': function (a, b) { return a % b; }
};
var unaryPreOpCB = {
    '-': function (a) { return -a; },
    '+': function (a) { return +a; },
    '!': function (a) { return !a; },
    '~': function (a) { return ~a; },
    'typeof': function (a) { return typeof a; },
    'void': function (a) { return void a; } // tslint:disable-line
};
var assignOpCB = {
    '=': function (a, m, b) { return a[m] = b; },
    '+=': function (a, m, b) { return a[m] += b; },
    '-=': function (a, m, b) { return a[m] -= b; },
    '*=': function (a, m, b) { return a[m] *= b; },
    '/=': function (a, m, b) { return a[m] /= b; },
    '%=': function (a, m, b) { return a[m] %= b; },
    '<<=': function (a, m, b) { return a[m] <<= b; },
    '>>=': function (a, m, b) { return a[m] >>= b; },
    '>>>=': function (a, m, b) { return a[m] >>>= b; },
    '|=': function (a, m, b) { return a[m] |= b; },
    '&=': function (a, m, b) { return a[m] &= b; },
    '^=': function (a, m, b) { return a[m] ^= b; }
};
var preUpdateOpCB = {
    '++': function (a, m) { return ++a[m]; },
    '--': function (a, m) { return --a[m]; }
};
var postUpdateOpCB = {
    '++': function (a, m) { return a[m]++; },
    '--': function (a, m) { return a[m]--; }
};
var es5EvalRules = {
    // Tokens
    Literal: function (n) { return n.value; },
    Identifier: function (node) { return this.context[node.name]; },
    ThisExpression: function (node) { return this.context; },
    ArrayExpression: function (node) {
        var _this = this;
        return node.elements.map(function (e) { return _this._eval(e); });
    },
    ObjectExpression: function (node) {
        var _this = this;
        return node.properties.reduce(function (res, n) {
            var key;
            if (n.key.type === IDENTIFIER_EXP)
                key = n.key.name;
            else if (n.key.type === LITERAL_EXP)
                key = n.key.value.toString();
            else
                throw new Error('Invalid property');
            if (key in res)
                throw new Error('Duplicate property');
            res[key] = _this._eval(n.value);
            return res;
        }, {});
    },
    // Operators
    MemberExpression: function (node) {
        var obj = this._eval(node.object);
        return obj[node.computed ? this._eval(node.property) : node.property.name];
    },
    CallExpression: function (node) {
        var _this = this;
        var callee;
        var caller = undefined;
        if (node.callee.type === MEMBER_EXP) {
            caller = this._eval(node.callee.object);
            callee = caller[node.callee.computed ? this._eval(node.callee.property) : node.callee.property.name];
        }
        else
            callee = this._eval(node.callee);
        return callee.apply(caller, node.arguments.map(function (e) { return _this._eval(e); }));
    },
    ConditionalExpression: function (node) {
        return this._eval(node.test) ? this._eval(node.consequent) : this._eval(node.alternate);
    },
    SequenceExpression: function (node) {
        var _this = this;
        return node.expressions.reduce(function (r, n) { return _this._eval(n); }, undefined);
    },
    LogicalExpression: function (node) {
        if (!(node.operator in binaryOpCB))
            throw unsuportedError(LOGICAL_EXP, node.operator);
        return binaryOpCB[node.operator](this._eval(node.left), this._eval(node.right));
    },
    BinaryExpression: function (node) {
        if (!(node.operator in binaryOpCB))
            throw unsuportedError(BINARY_EXP, node.operator);
        return binaryOpCB[node.operator](this._eval(node.left), this._eval(node.right));
    },
    AssignmentExpression: function (node) {
        if (!(node.operator in assignOpCB))
            throw unsuportedError(ASSIGN_EXP, node.operator);
        var left = lvalue(node.left);
        return assignOpCB[node.operator](left.o, left.m, this._eval(node.right));
    },
    UpdateExpression: function (node) {
        var cb = node.prefix ? preUpdateOpCB : postUpdateOpCB;
        if (!(node.operator in cb))
            throw unsuportedError(UPDATE_EXP, node.operator);
        var left = lvalue(node.left);
        return cb[node.operator](left.o, left.m, this._eval(node.argument));
    },
    UnaryExpression: function (node) {
        if (!(node.operator in unaryPreOpCB)) {
            if (node.operator === 'delete') {
                var obj = lvalue(node.argument);
                delete obj.o[obj.m];
            }
            else
                throw unsuportedError(UNARY_EXP, node.operator);
        }
        return unaryPreOpCB[node.operator](this._eval(node.argument));
    },
    NewExpression: function (node) {
        var _this = this;
        // tslint:disable-next-line:new-parens
        return new (Function.prototype.bind.apply(this._eval(node.calee), node.arguments.map(function (e) { return _this._eval(e); })));
    },
    ExpressionStatement: function (node) { return this._eval(node.expression); },
    Program: function (node) {
        var _this = this;
        return node.body.reduce(function (res, n) {
            return _this._eval(n);
        }, undefined);
    },
    Compound: function (node) {
        var _this = this;
        return node.body.reduce(function (res, n) {
            return _this._eval(n);
        }, undefined);
    }
};
function unsuportedError(type, operator) {
    return new Error('Unsuported ' + type + ': ' + operator);
}
function lvalue(node) {
    var obj, member;
    switch (node.type) {
        case IDENTIFIER_EXP:
            obj = this.context;
            member = this.name;
            break;
        case MEMBER_EXP:
            obj = this._eval(node.object);
            member = node.computed ? this._eval(node.property) : node.property.name;
            break;
        default:
            throw new Error('Invalid left side expression');
    }
    return { o: obj, m: member };
}
function es5EvalFactory() {
    return new StaticEval(es5EvalRules);
}

exports.es5EvalFactory = es5EvalFactory;
exports.es5ParserFactory = es5ParserFactory;

return exports;

}({}));
//# sourceMappingURL=espression.js.map
