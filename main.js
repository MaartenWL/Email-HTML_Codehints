/*
 * Copyright (c) 2016 m.lierop
*/

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";

    // Load dependent modules
    var AppInit             = brackets.getModule("utils/AppInit"),
        CodeHintManager     = brackets.getModule("editor/CodeHintManager"),
        HTMLUtils           = brackets.getModule("language/HTMLUtils"),
        HTMLTags            = require("text!HtmlTags.json"),
        HTMLAttributes      = require("text!HtmlAttributes.json"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        CSSUtils            = brackets.getModule("language/CSSUtils"),
        LanguageManager     = brackets.getModule("language/LanguageManager"),
        TokenUtils          = brackets.getModule("utils/TokenUtils"),
        StringMatch         = brackets.getModule("utils/StringMatch"),
        ColorUtils          = brackets.getModule("utils/ColorUtils"),
        CSSProperties       = require("text!CSSProperties.json"),
        tags,
        attributes,
        properties;
        
    
    // Context of the last request for hints: either CSSUtils.PROP_NAME,
    // CSSUtils.PROP_VALUE or null.
    var lastContext,
        stringMatcherOptions = { preferPrefixMatches: true };

    
    
    /**
     * @constructor
     */
    function TagHints() {
        this.exclusion = null;
    }
    
    /**
     * Check whether the exclusion is still the same as text after the cursor. 
     * If not, reset it to null.
     */
    TagHints.prototype.updateExclusion = function () {
        var textAfterCursor;
        if (this.exclusion && this.tagInfo) {
            textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };
    
    /**
     * Determines whether HTML tag hints are available in the current editor
     * context.
     * 
     * @param {Editor} editor 
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar 
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean} 
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non- null,
     * whether it is appropriate to do so.
     */
    TagHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos();
        
        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        this.editor = editor;
        if (implicitChar === null) {
            if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
                if (this.tagInfo.position.offset >= 0) {
                    if (this.tagInfo.position.offset === 0) {
                        this.exclusion = this.tagInfo.tagName;
                    } else {
                        this.updateExclusion();
                    }
                    return true;
                }
            }
            return false;
        } else {
            if (implicitChar === "<") {
                this.exclusion = this.tagInfo.tagName;
                return true;
            }
            return false;
        }
    };
       
    /**
     * Returns a list of availble HTML tag hints if possible for the current
     * editor context. 
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    TagHints.prototype.getHints = function (implicitChar) {
        var query,
            result;

        this.tagInfo = HTMLUtils.getTagInfo(this.editor, this.editor.getCursorPos());
        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            if (this.tagInfo.position.offset >= 0) {
                this.updateExclusion();
                query = this.tagInfo.tagName.slice(0, this.tagInfo.position.offset);
                result = $.map(tags, function (value, key) {
                    if (key.indexOf(query) === 0) {
                        return key;
                    }
                }).sort();
                
                return {
                    hints: result,
                    match: query,
                    selectInitial: true,
                    handleWideResults: false
                };
            }
        }
        
        return null;
    };
    
    /**
     * Inserts a given HTML tag hint into the current editor context. 
     * 
     * @param {string} hint 
     * The hint to be inserted into the editor context.
     *
     * @return {boolean} 
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    TagHints.prototype.insertHint = function (completion) {
        var start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            cursor = this.editor.getCursorPos(),
            charCount = 0;

        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            var textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = this.tagInfo.position.offset;
            } else {
                charCount = this.tagInfo.tagName.length;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - this.tagInfo.position.offset;
        end.ch = start.ch + charCount;

        if (this.exclusion || completion !== this.tagInfo.tagName) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
            this.exclusion = null;
        }
        
        return false;
    };

    
    
    
    
    
    
    
    
    
    /**
     * @constructor
     */
    function AttrHints() {
        this.globalAttributes = this.readGlobalAttrHints();
        this.cachedHints = null;
        this.exclusion = "";
    }

    /**
     * @private
     * Parse the code hints from JSON data and extract all hints from property names.
     * @return {!Array.<string>} An array of code hints read from the JSON data source.
     */
    AttrHints.prototype.readGlobalAttrHints = function () {
        return $.map(attributes, function (value, key) {
            if (value.global === "true") {
                return key;
            }
        });
    };

    /**
     * Helper function that determines the possible value hints for a given html tag/attribute name pair
     * 
     * @param {{queryStr: string}} query
     * The current query
     *
     * @param {string} tagName 
     * HTML tag name
     *
     * @param {string} attrName 
     * HTML attribute name
     *
     * @return {{hints: Array.<string>|$.Deferred, sortFunc: ?Function}} 
     * The (possibly deferred) hints and the sort function to use on thise hints.
     */
    AttrHints.prototype._getValueHintsForAttr = function (query, tagName, attrName) {
        // We look up attribute values with tagName plus a slash and attrName first.  
        // If the lookup fails, then we fall back to look up with attrName only. Most 
        // of the attributes in JSON are using attribute name only as their properties, 
        // but in some cases like "type" attribute, we have different properties like 
        // "script/type", "link/type" and "button/type".
        var hints = [],
            sortFunc = null;
        
        var tagPlusAttr = tagName + "/" + attrName,
            attrInfo = attributes[tagPlusAttr] || attributes[attrName];
        
        if (attrInfo) {
            if (attrInfo.type === "boolean") {
                hints = ["false", "true"];
            } else if (attrInfo.attribOption) {
                hints = attrInfo.attribOption;
            }
        }
        
        return { hints: hints, sortFunc: sortFunc };
    };
    
    /**
     * Check whether the exclusion is still the same as text after the cursor. 
     * If not, reset it to null.
     *
     * @param {boolean} attrNameOnly
     * true to indicate that we update the exclusion only if the cursor is inside an attribute name context.
     * Otherwise, we also update exclusion for attribute value context.
     */
    AttrHints.prototype.updateExclusion = function (attrNameOnly) {
        if (this.exclusion && this.tagInfo) {
            var tokenType = this.tagInfo.position.tokenType,
                offset = this.tagInfo.position.offset,
                textAfterCursor;
            
            if (tokenType === HTMLUtils.ATTR_NAME) {
                textAfterCursor = this.tagInfo.attr.name.substr(offset);
            } else if (!attrNameOnly && tokenType === HTMLUtils.ATTR_VALUE) {
                textAfterCursor = this.tagInfo.attr.value.substr(offset);
            }
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };
    
    /**
     * Determines whether HTML attribute hints are available in the current 
     * editor context.
     * 
     * @param {Editor} editor 
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar 
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean} 
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non-null,
     * whether it is appropriate to do so.
     */
    AttrHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos(),
            tokenType,
            offset,
            query;
        
        this.editor = editor;
        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        tokenType = this.tagInfo.position.tokenType;
        offset = this.tagInfo.position.offset;
        if (implicitChar === null) {
            query = null;
             
            if (tokenType === HTMLUtils.ATTR_NAME) {
                if (offset >= 0) {
                    query = this.tagInfo.attr.name.slice(0, offset);
                }
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                if (this.tagInfo.position.offset >= 0) {
                    query = this.tagInfo.attr.value.slice(0, offset);
                } else {
                    // We get negative offset for a quoted attribute value with some leading whitespaces 
                    // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                    // So just set the queryStr to an empty string. 
                    query = "";
                }
                
                // If we're at an attribute value, check if it's an attribute name that has hintable values.
                if (this.tagInfo.attr.name) {
                    var hintsAndSortFunc = this._getValueHintsForAttr({queryStr: query},
                                                                      this.tagInfo.tagName,
                                                                      this.tagInfo.attr.name);
                    var hints = hintsAndSortFunc.hints;
                    if (hints instanceof Array) {
                        // If we got synchronous hints, check if we have something we'll actually use
                        var i, foundPrefix = false;
                        for (i = 0; i < hints.length; i++) {
                            if (hints[i].indexOf(query) === 0) {
                                foundPrefix = true;
                                break;
                            }
                        }
                        if (!foundPrefix) {
                            query = null;
                        }
                    }
                }
            }

            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME && offset === 0) {
                    this.exclusion = this.tagInfo.attr.name;
                } else {
                    this.updateExclusion(false);
                }
            }
            
            return query !== null;
        } else {
            if (implicitChar === " " || implicitChar === "'" ||
                    implicitChar === "\"" || implicitChar === "=") {
                if (tokenType === HTMLUtils.ATTR_NAME) {
                    this.exclusion = this.tagInfo.attr.name;
                }
                return true;
            }
            return false;
        }
    };
    
    /**
     * Returns a list of availble HTML attribute hints if possible for the 
     * current editor context. 
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    AttrHints.prototype.getHints = function (implicitChar) {
        var cursor = this.editor.getCursorPos(),
            query = {queryStr: null},
            tokenType,
            offset,
            result = [];
 
        this.tagInfo = HTMLUtils.getTagInfo(this.editor, cursor);
        tokenType = this.tagInfo.position.tokenType;
        offset = this.tagInfo.position.offset;
        if (tokenType === HTMLUtils.ATTR_NAME || tokenType === HTMLUtils.ATTR_VALUE) {
            query.tag = this.tagInfo.tagName;
            
            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME) {
                    query.queryStr = this.tagInfo.attr.name.slice(0, offset);
                } else {
                    query.queryStr = this.tagInfo.attr.value.slice(0, offset);
                    query.attrName = this.tagInfo.attr.name;
                }
                this.updateExclusion(false);
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                // We get negative offset for a quoted attribute value with some leading whitespaces 
                // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                // So just set the queryStr to an empty string. 
                query.queryStr = "";
                query.attrName = this.tagInfo.attr.name;
            }

            query.usedAttr = HTMLUtils.getTagAttributes(this.editor, cursor);
        }

        if (query.tag && query.queryStr !== null) {
            var tagName = query.tag,
                attrName = query.attrName,
                filter = query.queryStr,
                unfiltered = [],
                hints = [],
                sortFunc = null;

            if (attrName) {
                var hintsAndSortFunc = this._getValueHintsForAttr(query, tagName, attrName);
                hints = hintsAndSortFunc.hints;
                sortFunc = hintsAndSortFunc.sortFunc;
                
            } else if (tags && tags[tagName] && tags[tagName].attributes) {
                unfiltered = tags[tagName].attributes.concat(this.globalAttributes);
                hints = $.grep(unfiltered, function (attr, i) {
                    return $.inArray(attr, query.usedAttr) < 0;
                });
            }
            
            if (hints instanceof Array && hints.length) {
                console.assert(!result.length);
                result = $.map(hints, function (item) {
                    if (item.indexOf(filter) === 0) {
                        return item;
                    }
                }).sort(sortFunc);
                return {
                    hints: result,
                    match: query.queryStr,
                    selectInitial: true,
                    handleWideResults: false
                };
            } else if (hints instanceof Object && hints.hasOwnProperty("done")) { // Deferred hints
                var deferred = $.Deferred();
                hints.done(function (asyncHints) {
                    deferred.resolveWith(this, [{
                        hints: asyncHints,
                        match: query.queryStr,
                        selectInitial: true,
                        handleWideResults: false
                    }]);
                });
                return deferred;
            } else {
                return null;
            }
        }

        
    };
    
    /**
     * Inserts a given HTML attribute hint into the current editor context.
     * 
     * @param {string} hint 
     * The hint to be inserted into the editor context.
     * 
     * @return {boolean} 
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    AttrHints.prototype.insertHint = function (completion) {
        var cursor = this.editor.getCursorPos(),
            start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            tokenType = this.tagInfo.position.tokenType,
            offset = this.tagInfo.position.offset,
            charCount = 0,
            insertedName = false,
            replaceExistingOne = this.tagInfo.attr.valueAssigned,
            endQuote = "",
            shouldReplace = true,
            textAfterCursor;

        if (tokenType === HTMLUtils.ATTR_NAME) {
            textAfterCursor = this.tagInfo.attr.name.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                replaceExistingOne = false;
            } else {
                charCount = this.tagInfo.attr.name.length;
            }
            // Append an equal sign and two double quotes if the current attr is not an empty attr
            // and then adjust cursor location before the last quote that we just inserted.
            if (!replaceExistingOne && attributes && attributes[completion] &&
                    attributes[completion].type !== "flag") {
                completion += "=\"\"";
                insertedName = true;
            } else if (completion === this.tagInfo.attr.name) {
                shouldReplace = false;
            }
        } else if (tokenType === HTMLUtils.ATTR_VALUE) {
            textAfterCursor = this.tagInfo.attr.value.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                // Set exclusion to null only after attribute value insertion,
                // not after attribute name insertion since we need to keep it 
                // for attribute value insertion.
                this.exclusion = null;
            } else {
                charCount = this.tagInfo.attr.value.length;
            }
            
            if (!this.tagInfo.attr.hasEndQuote) {
                endQuote = this.tagInfo.attr.quoteChar;
                if (endQuote) {
                    completion += endQuote;
                } else if (offset === 0) {
                    completion = "\"" + completion + "\"";
                }
            } else if (completion === this.tagInfo.attr.value) {
                shouldReplace = false;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - offset;
        end.ch = start.ch + charCount;

        if (shouldReplace) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
        }

        if (insertedName) {
            this.editor.setCursorPos(start.line, start.ch + completion.length - 1);

            // Since we're now inside the double-quotes we just inserted,
            // immediately pop up the attribute value hint.
            return true;
        } else if (tokenType === HTMLUtils.ATTR_VALUE && this.tagInfo.attr.hasEndQuote) {
            // Move the cursor to the right of the existing end quote after value insertion.
            this.editor.setCursorPos(start.line, start.ch + completion.length + 1);
        }
        
        return false;
    };
    
    
    
    
    
    
    
    
    
    
     /**
     * @constructor
     */
    function CssPropHints() {
        this.primaryTriggerKeys = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-()";
        this.secondaryTriggerKeys = ":";
        this.exclusion = null;
    }

    /**
     * Get the CSS style text of the file open in the editor for this hinting session.
     * For a CSS file, this is just the text of the file. For an HTML file,
     * this will be only the text in the <style> tags.
     *
     * @return {string} the "css" text that can be sent to CSSUtils to extract all named flows.
     */
    
     CssPropHints.prototype.getCssStyleText = function () {
        if (LanguageManager.getLanguageForPath(this.editor.document.file.fullPath).getId() === "html") {
            // Collect text in all style blocks
            var text = "",
                styleBlocks = HTMLUtils.findBlocks(this.editor, "css");
            
            styleBlocks.forEach(function (styleBlock) {
                text += styleBlock.text;
            });
            
            return text;
        } else {
            // css file, just return the text
            return this.editor.document.getText();
        }
    };
    
    /**
     * Extract all the named flows from any "flow-from" or "flow-into" properties 
     * in the current document. If we have the cached list of named flows and the 
     * cursor is still on the same line as the cached cursor, then the cached list
     * is returned. Otherwise, we recollect all named flows and update the cache.
     *
     * @return {Array.<string>} All named flows available in the current document.
     */
    CssPropHints.prototype.getNamedFlows = function () {
        if (this.namedFlowsCache) {
            // If the cursor is no longer on the same line, then the cache is stale.
            // Delete cache so we can extract all named flows again.
            if (this.namedFlowsCache.cursor.line !== this.cursor.line) {
                this.namedFlowsCache = null;
            }
        }
        
        if (!this.namedFlowsCache) {
            this.namedFlowsCache = {};
            this.namedFlowsCache.flows = CSSUtils.extractAllNamedFlows(this.getCssStyleText());
            this.namedFlowsCache.cursor = { line: this.cursor.line, ch: this.cursor.ch };
        }
        
        return this.namedFlowsCache.flows;
    };
    
    /**
     * Check whether the exclusion is still the same as text after the cursor. 
     * If not, reset it to null.
     *
     * @param {boolean} propNameOnly
     * true to indicate that we update the exclusion only if the cursor is inside property name context.
     * Otherwise, we also update exclusion for property value context.
     */
    CssPropHints.prototype.updateExclusion = function (propNameOnly) {
        var textAfterCursor;
        if (this.exclusion && this.info) {
            if (this.info.context === CSSUtils.PROP_NAME) {
                textAfterCursor = this.info.name.substr(this.info.offset);
            } else if (!propNameOnly && this.info.context === CSSUtils.PROP_VALUE) {
                textAfterCursor = this.info.value.substr(this.info.offset);
            }
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };

    /**
     * Determines whether CSS propertyname or -name hints are available in the current editor
     * context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {String} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {Boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non- null,
     * whether it is appropriate to do so.
     */
    CssPropHints.prototype.hasHints = function (editor, implicitChar) {
        this.editor = editor;
        var cursor = this.editor.getCursorPos();

        lastContext = null;
        this.info = CSSUtils.getInfoAtPos(editor, cursor);

        if (this.info.context !== CSSUtils.PROP_NAME && this.info.context !== CSSUtils.PROP_VALUE) {
            return false;
        }

        if (implicitChar) {
            this.updateExclusion(false);
            if (this.info.context === CSSUtils.PROP_NAME) {
                // Check if implicitChar is the first character typed before an existing property name.
                if (!this.exclusion && this.info.offset === 1 && implicitChar === this.info.name[0]) {
                    this.exclusion = this.info.name.substr(this.info.offset);
                }
            }
            
            return (this.primaryTriggerKeys.indexOf(implicitChar) !== -1) ||
                   (this.secondaryTriggerKeys.indexOf(implicitChar) !== -1);
        } else if (this.info.context === CSSUtils.PROP_NAME) {
            if (this.info.offset === 0) {
                this.exclusion = this.info.name;
            } else {
                this.updateExclusion(true);
            }
        }

        return true;
    };

    /**
     * Returns a sorted and formatted list of hints with the query substring
     * highlighted.
     * 
     * @param {Array.<Object>} hints - the list of hints to format
     * @param {string} query - querystring used for highlighting matched
     *      portions of each hint
     * @return {Array.jQuery} sorted Array of jQuery DOM elements to insert
     */
    function formatHints(hints, query) {
        var hasColorSwatch = hints.some(function (token) {
            return token.color;
        });

        StringMatch.basicMatchSort(hints);
        return hints.map(function (token) {
            var $hintObj = $("<span>").addClass("brackets-css-hints");

            // highlight the matched portion of each hint
            if (token.stringRanges) {
                token.stringRanges.forEach(function (item) {
                    if (item.matched) {
                        $hintObj.append($("<span>")
                            .text(item.text)
                            .addClass("matched-hint"));
                    } else {
                        $hintObj.append(item.text);
                    }
                });
            } else {
                $hintObj.text(token.value);
            }

            if (hasColorSwatch) {
                $hintObj = ColorUtils.formatColorHint($hintObj, token.color);
            }

            return $hintObj;
        });
    }
    
    /**
     * Returns a list of availble CSS propertyname or -value hints if possible for the current
     * editor context. 
     * 
     * @param {Editor} implicitChar 
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    CssPropHints.prototype.getHints = function (implicitChar) {
        this.cursor = this.editor.getCursorPos();
        this.info = CSSUtils.getInfoAtPos(this.editor, this.cursor);

        var needle = this.info.name,
            valueNeedle = "",
            context = this.info.context,
            valueArray,
            type,
            namedFlows,
            result,
            selectInitial = false;

        // Clear the exclusion if the user moves the cursor with left/right arrow key.
        this.updateExclusion(true);

        if (context === CSSUtils.PROP_VALUE) {

            // Always select initial value
            selectInitial = true;

            // When switching from a NAME to a VALUE context, restart the session
            // to give other more specialized providers a chance to intervene.
            if (lastContext === CSSUtils.PROP_NAME) {
                return true;
            } else {
                lastContext = CSSUtils.PROP_VALUE;
            }

            if (!properties[needle]) {
                return null;
            }
            
            // Cursor is in an existing property value or partially typed value
            if (!this.info.isNewItem && this.info.index !== -1) {
                valueNeedle = this.info.values[this.info.index].trim();
                valueNeedle = valueNeedle.substr(0, this.info.offset);
            }
            
            valueArray = properties[needle].values;
            type = properties[needle].type;
            if (type === "named-flow") {
                namedFlows = this.getNamedFlows();

                if (valueNeedle.length === this.info.offset && namedFlows.indexOf(valueNeedle) !== -1) {
                    // Exclude the partially typed named flow at cursor since it
                    // is not an existing one used in other css rule.
                    namedFlows.splice(namedFlows.indexOf(valueNeedle), 1);
                }
                
                valueArray = valueArray.concat(namedFlows);
            } else if (type === "color") {
                valueArray = valueArray.concat(ColorUtils.COLOR_NAMES.map(function (color) {
                    return { text: color, color: color };
                }));
                valueArray.push("transparent", "currentColor");
            }
            
            result = $.map(valueArray, function (pvalue) {
                var result = StringMatch.stringMatch(pvalue.text || pvalue, valueNeedle, stringMatcherOptions);
                if (result) {
                    if (pvalue.color) {
                        result.color = pvalue.color;
                    }

                    return result;
                }
            });

            return {
                hints: formatHints(result, valueNeedle),
                match: null, // the CodeHintManager should not format the results
                selectInitial: selectInitial
            };
        } else if (context === CSSUtils.PROP_NAME) {

            // Select initial property if anything has been typed
            if (this.primaryTriggerKeys.indexOf(implicitChar) !== -1 || needle !== "") {
                selectInitial = true;
            }

            lastContext = CSSUtils.PROP_NAME;
            needle = needle.substr(0, this.info.offset);

            result = $.map(properties, function (pvalues, pname) {
                var result = StringMatch.stringMatch(pname, needle, stringMatcherOptions);
                if (result) {
                    return result;
                }
            });

            return {
                hints: formatHints(result, needle),
                match: null, // the CodeHintManager should not format the results
                selectInitial: selectInitial,
                handleWideResults: false
            };
        }
        return null;
    };

    /**
     * Inserts a given CSS protertyname or -value hint into the current editor context.
     *
     * @param {String} hint
     * The hint to be inserted into the editor context.
     *
     * @return {Boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    CssPropHints.prototype.insertHint = function (hint) {
        var offset = this.info.offset,
            cursor = this.editor.getCursorPos(),
            start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            keepHints = false,
            adjustCursor = false,
            newCursor,
            ctx;

        if (hint.jquery) {
            hint = hint.text();
        }

        if (this.info.context !== CSSUtils.PROP_NAME && this.info.context !== CSSUtils.PROP_VALUE) {
            return false;
        }

        start.line = end.line = cursor.line;
        start.ch = cursor.ch - offset;

        if (this.info.context === CSSUtils.PROP_NAME) {
            keepHints = true;
            var textAfterCursor = this.info.name.substr(this.info.offset);
            if (this.info.name.length === 0 || CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                // It's a new insertion, so append a colon and set keepHints
                // to show property value hints.
                hint += ": ";
                end.ch = start.ch;
                end.ch += offset;

                if (this.exclusion) {
                    // Append a space to the end of hint to insert and then adjust
                    // the cursor before that space.
                    hint += " ";
                    adjustCursor = true;
                    newCursor = { line: cursor.line,
                                  ch: start.ch + hint.length - 1 };
                    this.exclusion = null;
                }
            } else {
                // It's a replacement of an existing one or just typed in property.
                // So we need to check whether there is an existing colon following
                // the current property name. If a colon already exists, then we also
                // adjust the cursor position and show code hints for property values.
                end.ch = start.ch + this.info.name.length;
                ctx = TokenUtils.getInitialContext(this.editor._codeMirror, cursor);
                if (ctx.token.string.length > 0 && !/\S/.test(ctx.token.string)) {
                    // We're at the very beginning of a property name. So skip it
                    // before we locate the colon following it.
                    TokenUtils.moveNextToken(ctx);
                }
                if (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx) && ctx.token.string === ":") {
                    adjustCursor = true;
                    newCursor = { line: cursor.line,
                                  ch: cursor.ch + (hint.length - this.info.name.length) };
                    // Adjust cursor to the position after any whitespace that follows the colon, if there is any.
                    if (TokenUtils.moveNextToken(ctx) && ctx.token.string.length > 0 && !/\S/.test(ctx.token.string)) {
                        newCursor.ch += ctx.token.string.length;
                    }
                } else {
                    hint += ": ";
                }
            }
        } else {
            if (!this.info.isNewItem && this.info.index !== -1) {
                // Replacing an existing property value or partially typed value
                end.ch = start.ch + this.info.values[this.info.index].length;
            } else {
                // Inserting a new property value
                end.ch = start.ch;
            }

            var parenMatch = hint.match(/\(.*?\)/);
            if (parenMatch) {
                // value has (...), so place cursor inside opening paren
                // and keep hints open
                adjustCursor = true;
                newCursor = { line: cursor.line,
                              ch: start.ch + parenMatch.index + 1 };
                keepHints = true;
            }
        }

        // HACK (tracking adobe/brackets#1688): We talk to the private CodeMirror instance
        // directly to replace the range instead of using the Document, as we should. The
        // reason is due to a flaw in our current document synchronization architecture when
        // inline editors are open.
        this.editor._codeMirror.replaceRange(hint, start, end);

        if (adjustCursor) {
            this.editor.setCursorPos(newCursor);
        }

        return keepHints;
    };
    
    
    

    AppInit.appReady(function () {
        // Parse JSON files
        tags = JSON.parse(HTMLTags);
        attributes = JSON.parse(HTMLAttributes);
        properties = JSON.parse(CSSProperties);
        
        // Register code hint providers
        var tagHints = new TagHints();
        var attrHints = new AttrHints();
        CodeHintManager.registerHintProvider(tagHints, ["html"], 9);
        CodeHintManager.registerHintProvider(attrHints, ["html"], 9);
    
        // For unit testing
        exports.tagHintProvider = tagHints;
        exports.attrHintProvider = attrHints;
    });
});
