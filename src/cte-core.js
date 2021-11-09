/*
 * Copied Template Editor - Core Script
 *
 * This contains all the required functionality of CTE. As evident by the
 * array below, this file depends on a lot of things, so loading it is likely
 * going to be a bit tough. A loader can be used instead to optimize loading
 * times.
 *
 * More information on the userscript itself can be found at [[User:Chlod/CTE]].
 */
// <nowiki>
mw.loader.using([
    "oojs-ui-core",
    "oojs-ui-windows",
    "oojs-ui-widgets",
    "oojs-ui.styles.icons-editing-core",
    "oojs-ui.styles.icons-editing-advanced",
    "oojs-ui.styles.icons-interactions",
    "ext.visualEditor.moduleIcons",
    "mediawiki.util",
    "mediawiki.api",
    "mediawiki.Title",
    "mediawiki.widgets",
    "mediawiki.widgets.datetime",
    "jquery.makeCollapsible"
], async function() {

    // =============================== STYLES =================================

    mw.util.addCSS(`
        .cte-preview .copiednotice {
            margin-left: 0;
            margin-right: 0;
        }
        .cte-temop {
            margin: 8px;
        }
        .cte-temop > div {
            width: 50%;
            display: inline-block;
        }
        .cte-fieldset {
            border: 1px solid gray;
            background-color: #ddf7ff;
            padding: 16px;
            min-width: 200px;
        }
        .cte-fieldset-date {
            float: left;
            margin-top: 10px !important;
        }
        .cte-fieldset-advswitch {
            float: right;
        }
        .cte-fieldset-advswitch .oo-ui-fieldLayout-field,
        .cte-fieldset-date .oo-ui-fieldLayout-field {
            display: inline-block !important;
        }
        .cte-fieldset-advswitch .oo-ui-fieldLayout-header {
            display: inline-block !important;
            margin-right: 16px;
        }
        .cte-fieldset-date .oo-ui-iconElement-icon {
            left: 0.5em;
            width: 1em;
            height: 1em;
            top: 0.4em;
        }
        .cte-fieldset-date .mw-widgets-datetime-dateTimeInputWidget-editField {
            min-width: 2.5ch !important;
        }
        .cte-fieldset-date :not(.mw-widgets-datetime-dateTimeInputWidget-empty) >
        .mw-widgets-datetime-dateTimeInputWidget-handle {
            padding-right: 0;
        }
        .cte-page-template, 
        .cte-fieldset-date.oo-ui-actionFieldLayout.oo-ui-fieldLayout-align-top .oo-ui-fieldLayout-header {
            padding-bottom: 0 !important;
        }
        .cte-page-row {
            padding-top: 0 !important;
        }
        .copied-template-editor .oo-ui-fieldsetLayout.oo-ui-iconElement > .oo-ui-fieldsetLayout-header {
            position: relative;
        }
        .oo-ui-actionFieldLayout.oo-ui-fieldLayout-align-top .oo-ui-fieldLayout-header {
            padding-bottom: 6px !important;
        }
        .oo-ui-windowManager-modal > .oo-ui-window.oo-ui-dialog.oo-ui-messageDialog {
            z-index: 200;
        }
    `);

    // ============================== CONSTANTS ===============================

    /**
     * Copied template rows as strings.
     * @type {string[]}
     */
    const copiedTemplateRowParameters = [
        "from", "from_oldid", "to", "to_diff",
        "to_oldid", "diff", "url", "date", "afd", "merge"
    ];

    /**
     * Aliases of the {{copied}} template. This must be in lowercase and all
     * spaces must be replaced with underscores.
     * @type {string[]}
     */
    const copiedTemplateAliases = [
        "template:copied",
        "template:copied_from",
        "template:copywithin"
    ];

    const advert = "([[User:Chlod/CTE|CopiedTemplateEditor]])";

    // =========================== TYPE DEFINITIONS ===========================

    /**
     * Represents a row in the {{copied}} template. These should represent
     * their actual values instead of raw parameters from the template.
     *
     * @typedef {Record<string, string>} RawCopiedTemplateRow
     * @property {string} from
     *           The original article.
     * @property {string|null} from_oldid
     *           The revision ID from which the content was copied from.
     * @property {string|null} to
     *           The article that content was copied into.
     * @property {string|null} to_diff
     *           The revision number of the copying diff.
     * @property {string|null} to_oldid
     *           The oldid of the copying diff (for multiple edits).
     * @property {string|null} diff
     *           The URL of the copying diff. Overrrides to_diff and to_oldid.
     * @property {string|null} date
     *           The date when the copy was performed.
     * @property {string|null} afd
     *           Whether or not this copy was made from the results of an AfD discussion.
     * @property {string|null} merge
     *           Whether or not this copy was made from the results of a merge discussion.
     */

    /**
     * Represents the contents of a `data-mw` attribute.
     * @typedef {Object} MediaWikiData
     * @property {(TemplateData | string | any)[]} parts
     *           The parts of this data object. Realistically, this field doesn't
     *           just include templates but also extensions as well, but we don't
     *           need those for this userscript.
     */

    /**
     * Represents a template in a `data-mw` attribute.
     * @typedef {Object} TemplateData
     * @property {Object} template
     *           Information on the template.
     * @property {Object} template.target
     *           The tempalte target.
     * @property {string} template.target.wt
     *           The wikitext of the template.
     * @property {string} template.target.href
     *           A link to the template relative to $wgArticlePath.
     * @property {Object.<string, {wt: string}>} template.params
     *           The properties of this template.
     * @property {number} template.i
     *           The identifier of this template within the {@link MediaWikiData}.
     */

    /**
     * Represents a callback for template data-modifying operations.
     * @callback TemplateDataModifier
     * @param {TemplateData} templateData The existing element {@link TemplateData}.
     * @returns {TemplateData|null} The modified template data.
     */

    // =========================== HELPER FUNCTIONS ===========================

    /**
     * Encodes text for an API parameter. This performs both an encodeURIComponent
     * and a string replace to change spaces into underscores.
     *
     * @param {string} text
     */
    function encodeAPIComponent(text) {
        return encodeURIComponent(text.replace(/ /g, "_"));
    }

    /**
     * Ask for confirmation before unloading.
     * @param {BeforeUnloadEvent} event
     */
    function exitBlock(event) {
        event.preventDefault();
        return event.returnValue = undefined;
    }

    /**
     * Converts a normal error into an OO.ui.Error for ProcessDialogs.
     * @param {Error} error A plain error object.
     * @param {Object} config Error configuration.
     * @param {boolean} config.recoverable Whether or not the error is recoverable.
     * @param {boolean} config.warning Whether or not the error is a warning.
     */
    function errorToOO(error, config) {
        new OO.ui.Error(error.message, config);
    }

    // =============================== CLASSES ================================

    class RowChangeEvent extends Event {

        /**
         * Creates a new RowChangeEvent.
         * @param {string} type The event type.
         * @param {CopiedTemplateRow} row The changed row.
         */
        constructor(type, row) {
            super(type);
            this.row = row;
        }

    }

    /**
     * Represents a row/entry in a {{copied}} template.
     */
    class CopiedTemplateRow {

        get parent() {
            return this._parent;
        }

        /**
         * Sets the parent. Automatically moves this template from one
         * parent's row set to another.
         * @param {CopiedTemplate} newParent The new parent.
         */
        set parent(newParent) {
            this._parent.deleteRow(this);
            newParent.addRow(this);
            this._parent = newParent;
        }

        /**
         * Creates a new RawCopiedTemplateRow
         * @param {RawCopiedTemplateRow} rowObjects
         * @param {CopiedTemplate} parent
         */
        constructor(rowObjects, parent) {
            // Why not Object.assign? For types.
            this.from = rowObjects["from"];
            this.from_oldid = rowObjects["from_oldid"];
            this.to = rowObjects["to"];
            this.to_diff = rowObjects["to_diff"];
            this.to_oldid = rowObjects["to_oldid"];
            this.diff = rowObjects["diff"];
            this.date = rowObjects["date"];
            this.afd = rowObjects["afd"];
            this.merge = rowObjects["merge"];

            // Clean all zero-length parameters.
            for (const param of copiedTemplateRowParameters) {
                if (this[param] && this[param].trim && this[param].trim().length === 0) {
                    delete this[param];
                }
            }

            /**
             * The parent of this row object.
             * @type {CopiedTemplate}
             */
            this._parent = parent;
            this.id = btoa(`${Math.random() * 0.1}`.substr(5));
        }

        /**
         * Clones this row.
         * @param {CopiedTemplate} parent The parent of this new row.
         * @returns {CopiedTemplateRow}
         */
        clone(parent) {
            // noinspection JSCheckFunctionSignatures
            return new CopiedTemplateRow(this, parent);
        }

    }

    /**
     * Represents a single {{copied}} template in the Parsoid document.
     * @class
     */
    class CopiedTemplate extends EventTarget {

        get rows() {
            return this._rows;
        }

        /**
         * Creates a new CopiedTemplate class.
         * @param {HTMLElement} parsoidElement
         *        The HTML element from the Parsoid DOM.
         * @param {number} i
         *        The identifier of this template within the {@link MediaWikiData}
         */
        constructor(parsoidElement, i) {
            super();
            /**
             * The Parsoid element of this template.
             * @type {HTMLElement}
             */
            this.element = parsoidElement;
            /**
             * The identifier of this template within the {@link MediaWikiData}
             * @type {number}
             */
            this.i = i;
            /**
             * A unique name for this template.
             * @type {string}
             */
            this.name = this.element.getAttribute("about")
                .replace(/^#mwt/, "") + "-" + i;
            this.parse();
        }

        /**
         * Access the element template data and automatically modify the element's
         * `data-mw` attribute to reflect the possibly-modified data.
         * @param {TemplateDataModifier} callback The callback for data-modifying operations.
         */
        accessTemplateData(callback) {
            /** @type {MediaWikiData} */
            const jsonData = JSON.parse(
                this.element.getAttribute("data-mw")
            );

            /** @type TemplateData */
            let templateData;
            /** @type number */
            let index;
            jsonData.parts.forEach(
                (v, k) => {
                    if (v != null && v.template !== undefined && v.template.i === this.i) {
                        templateData = v;
                        index = k;
                    }
                }
            );
            if (templateData === undefined) {
                throw new TypeError("Invalid `i` given to template.");
            }

            templateData = callback(templateData);

            if (templateData === undefined)
                jsonData.parts.splice(index, 1);
            else
                jsonData.parts[index] = templateData;

            this.element.setAttribute(
                "data-mw",
                JSON.stringify(jsonData)
            );

            if (jsonData.parts.length === 0) {
                parsoidDocument.document.querySelectorAll(`[about="${
                    this.element.getAttribute("about")
                }"]`).forEach(e => {
                    e.parentElement.removeChild(e);
                });
            }
        }

        /**
         * Parses parameters into class properties. This WILL destroy unknown
         * parameters and parameters in the incorrect order!
         *
         * This function does not modify the template data.
         */
        parse() {
            this.accessTemplateData((templateData) => {
                /** @type {Object.<string, {wt: string}>} */
                const params = templateData.template.params;

                // /**
                //  * The parameters of this template.
                //  * @type {Object.<string, string>}
                //  */
                // this.params = Object.fromEntries(
                //     Object.entries(params)
                //         .map(([k, v]) => [k, v.wt])
                // );
                if (params["collapse"] !== undefined) {
                    /**
                     * Whether or not this notice is collapsed (rows hidden if
                     * rows are two or more).
                     * @type {boolean}
                     */
                    this.collapsed = params["collapse"].wt.trim().length > 0
                }
                if (params["small"] !== undefined) {
                    /**
                     * Whether or not this notice is a right-floating box.
                     * @type {boolean}
                     */
                    this.small = params["small"].wt.trim().length > 0
                }

                // Extract {{copied}} rows.
                const rows = [];

                // Numberless
                if (Object.keys(params).some(v => copiedTemplateRowParameters.includes(v))) {
                    // If `from`, `to`, ..., or `merge` is found.
                    const row = {};
                    copiedTemplateRowParameters.forEach((key) => {
                        if (params[key] !== undefined) {
                            row[key] = params[key].wt;
                        } else if (params[`${key}1`] !== undefined) {
                            row[`${key}1`] = params[`${key}1`].wt;
                        }
                    });
                    rows.push(new CopiedTemplateRow(row, this));
                }

                // Numbered
                let i = 1, continueExtracting = true;
                do {
                    if (Object.keys(params).some(v =>
                        copiedTemplateRowParameters.map(v2 => `${v2}${i}`).includes(v)
                    )) {
                        const row = {};
                        copiedTemplateRowParameters.forEach((key) => {
                            if (params[`${key}${i}`] !== undefined) {
                                row[key] = params[`${key}${i}`].wt;
                            } else if (i === 1 && params[key] !== undefined) {
                                row[key] = params[key].wt;
                            }
                        });
                        rows.push(new CopiedTemplateRow(row, this));
                    } else if (!(i === 1 && rows.length > 0)) {
                        // Row doesn't exist. Stop parsing from here.
                        continueExtracting = false;
                    }

                    i++;
                } while (continueExtracting);
                /**
                 * All of the rows of this template.
                 * @type {CopiedTemplateRow[]}
                 */
                this._rows = rows;

                return templateData;
            });
        }

        /**
         * Saves the current template data to the Parsoid element.
         */
        save() {
            this.accessTemplateData((data) => {
                const params = {};

                if (this.collapsed)
                    params["collapse"] = { wt: "yes" };
                if (this.small)
                    params["small"] = { wt: "yes" };

                if (this._rows.length === 1) {
                    for (const k of copiedTemplateRowParameters) {
                        if (this._rows[0][k] !== undefined)
                            params[k] = { wt: this._rows[0][k] };
                    }
                } else {
                    for (let i = 0; i < this._rows.length; i++) {
                        for (const k of copiedTemplateRowParameters) {
                            if (this._rows[i][k] !== undefined)
                                params[k + (i === 0 ? "" : i + 1)] = { wt: this._rows[i][k] };
                        }
                    }
                }

                data.template.params = params;
                return data;
            });
            this.dispatchEvent(new Event("save"));
        }

        /**
         * Adds a row to this template.
         * @param {CopiedTemplateRow} row The row to add.
         */
        addRow(row) {
            this._rows.push(row);
            this.save();
            this.dispatchEvent(new RowChangeEvent("add", row));
        }

        /**
         * Deletes a row to this template.
         * @param {CopiedTemplateRow} row The row to delete.
         */
        deleteRow(row) {
            const i = this._rows.findIndex(v => v === row);
            if (i !== -1) {
                this._rows.splice(i, 1);
                this.save();
                this.dispatchEvent(new RowChangeEvent("delete", row));
            }
        }

        /**
         * Destroys this template completely.
         */
        destroy() {
            this.dispatchEvent(new Event("destroy"));
            this.accessTemplateData(() => undefined);
            // Self-destruct
            Object.keys(this).forEach(k => delete this[k]);
        }

        /**
         * Copies in the rows of another {@link CopiedTemplate}, and
         * optionally deletes that template or clears its contents.
         * @param {CopiedTemplate} template The template to copy from.
         * @param {Object} options Options for this merge.
         * @param {boolean?} options.delete
         *        Whether the reference template will be deleted after merging.
         * @param {boolean?} options.clear
         *        Whether the reference template's rows will be cleared after merging.
         */
        merge(template, options = {}) {
            if (template.rows === undefined || template === this)
                // Deleted or self
                return;
            for (const row of template.rows) {
                if (options.clear)
                    row.parent = this;
                else
                    this.addRow(row.clone(this));
            }
            if (options.delete) {
                template.destroy();
            }
        }

        toWikitext() {
            let wikitext = "{{";
            this.accessTemplateData((data) => {
                wikitext += data.template.target.wt;
                for (const [key, value] of Object.entries(data.template.params)) {
                    wikitext += `| ${key} = ${value.wt}\n`;
                }
                return data;
            });
            return wikitext + "}}";
        }

        /**
         * Converts this template to parsed HTML.
         * @returns {Promise<string>}
         */
        async generatePreview() {
            return new mw.Api().post({
                action: "parse",
                format: "json",
                formatversion: "2",
                utf8: 1,
                title: parsoidDocument.page,
                text: this.toWikitext()
            }).then(data => data["parse"]["text"]);
        }

    }

    /**
     * An object containing an {@link HTMLIFrameElement} along with helper functions
     * to make manipulation easier.
     */
    class ParsoidDocument extends EventTarget {

        /**
         * The {@link Document} object of the iframe.
         * @returns {Document}
         */
        get document() {
            return this._document;
        }

        /**
         * Whether or not the frame has been built.
         * @returns {boolean}
         */
        get built() {
            return this.iframe !== undefined;
        }

        /**
         * Whether or not the frame has a page loaded.
         * @returns {boolean}
         */
        get loaded() {
            return this.page !== undefined;
        }

        /**
         * Constructs and returns the {@link HTMLIFrameElement} for this class.
         * @returns {HTMLIFrameElement}
         */
        buildFrame() {
            if (this.iframe !== undefined)
                throw "Frame already built!";

            this.iframe = document.createElement("iframe");
            this.iframe.id = "copiedhelperframe";
            Object.assign(this.iframe.style, {
                width: "0",
                height: "0",
                border: "0",
                position: "fixed",
                top: "0",
                left: "0"
            });

            this.iframe.addEventListener("load", () => {
                /**
                 * The document of this ParsoidDocument's IFrame.
                 * @type {Document}
                 * @private
                 */
                this._document = this.iframe.contentWindow.document;
            });

            return this.iframe;
        }

        /**
         * Initializes the frame. The frame must have first been built with
         * {@link buildFrame}.
         * @param {string} page The page to load.
         */
        async loadFrame(page) {
            if (this.iframe === undefined)
                throw "ParsoidDocument IFrame not yet built!";
            if (this.page !== undefined)
                throw "Page already loaded. Use `reloadFrame` to rebuilt the iframe document."

            return fetch(`/api/rest_v1/page/html/${ encodeAPIComponent(page) }?stash=true`)
                .then(data => {
                    /**
                     * The ETag of this iframe's content.
                     * @type {string}
                     */
                    this.etag = data.headers.get("ETag");

                    if (data.status === 404) {
                        console.log("[CTE] Talk page not found. Using fallback HTML.");
                        // Talk page doesn't exist. Load in a dummy IFrame.
                        this.notFound = true;
                        // A Blob is used in order to allow cross-frame access without changing
                        // the origin of the frame.
                        return Promise.resolve(ParsoidDocument.defaultDocument);
                    } else {
                        return data.text();
                    }
                })
                .then(/** @param {string} html */ async (html) => {
                    // A Blob is used in order to allow cross-frame access without changing
                    // the origin of the frame.
                    this.iframe.src = URL.createObjectURL(
                        new Blob([html], {type : "text/html"})
                    );
                    /**
                     * The page currently loaded.
                     * @type {string}
                     */
                    this.page = page;
                })
                .then(async () => {
                    return new Promise((res) => {
                        this.iframe.addEventListener("load", () => {
                            this.findCopiedNotices();
                            this.originalNoticeCount = this.copiedNotices.length;
                            res();
                        });
                    });
                })
                .catch(async (error) => {
                    mw.notify([
                        (() => {
                            const a = document.createElement("span");
                            a.innerText = "An error occured while starting CTE: "
                            return a;
                        })(),
                        (() => {
                            const b = document.createElement("b");
                            b.innerText = error.message;
                            return b;
                        })(),
                    ], {
                        tag: "cte-open-error",
                        type: "error"
                    });
                    window.CopiedTemplateEditor.toggleButtons(true);
                    throw error;
                });
        }

        /**
         * Destroys the frame and pops it off of the DOM (if inserted).
         * Silently fails if the frame has not yet been built.
         */
        destroyFrame() {
            if (this.iframe && this.iframe.parentElement) {
                this.iframe.parentElement.removeChild(this.iframe);
                this.iframe = undefined;
            }
        }

        /**
         * Clears the frame for a future reload.
         */
        resetFrame() {
            this.page = undefined;
        }

        /**
         * Reloads the page. This will destroy any modifications made to the document.
         */
        async reloadFrame() {
            const page = this.page;
            this.page = undefined;
            return this.loadFrame(page);
        }

        findCopiedNotices() {
            if (!this.loaded)
                throw "parsoidDocument has nothing loaded.";
            /**
             * A list of {{copied}} notices in the document.
             * @type {CopiedTemplate[]}
             */
            this.copiedNotices = [];

            parsoidDocument.document.querySelectorAll(
                "[typeof=\"mw:Transclusion\"][data-mw]"
            ).forEach(e => {
                /** @type {MediaWikiData} */
                const mwData = JSON.parse(e.getAttribute("data-mw"));

                for (const part of mwData.parts) {
                    if (part.template !== undefined) {
                        if (part.template.target.href == null)
                            // Parser function.
                            continue;
                        // This is a template. Time to identify what template.
                        for (const alias of copiedTemplateAliases) {
                            if (part.template.target.href.toLowerCase().includes(alias)) {
                                // This is a copied template.
                                const notice = new CopiedTemplate(e, part.template.i);
                                this.copiedNotices.push(
                                    notice
                                );
                                notice.addEventListener("destroy", () => {
                                    const i = this.copiedNotices.indexOf(notice);
                                    this.copiedNotices.splice(i, 1);
                                });
                            }
                        }
                    }
                }
            });
        }

        /**
         * Look for a good spot to place a {{copied}} template.
         * @return {[InsertPosition, HTMLElement]|null}
         *         A spot to place the template, `null` if a spot could not be found.
         */
        findCopiedNoticeSpot() {
            /**
             * Returns the last item of an HTMLElement array.
             * @param {NodeListOf<HTMLElement>} array The array to get the last element from
             * @returns {HTMLElement}
             */
            function last(array) { return array[array.length - 1]; }

            /** @type {[InsertPosition, HTMLElement|null][]} */
            const possibleSpots = [
                ["afterend", last(this.document.querySelectorAll(".copiednotice[data-mw]"))],
                ["afterend", last(this.document.querySelectorAll(".t-todo"))],
                ["afterend", this.document.querySelector(".wpbs") ? last(
                    this.document.querySelectorAll(`[about="${
                        this.document.querySelector(".wpbs")
                            .getAttribute("about")
                    }"]`)
                ) : null],
                ["afterend", last(this.document.querySelectorAll(".wpb[data-mw]"))],
                ["afterend", last(this.document.querySelectorAll(
                    "[data-mw-section-id=\"0\"] .tmbox[data-mw]:not(.mbox-small):not(.talkheader[data-mw])"
                ))],
                ["afterend", this.document.querySelector(".talkheader[data-mw]")],
                ["afterbegin", this.document.querySelector("section[data-mw-section-id=\"0\"]")]
            ];

            for (const spot of possibleSpots) {
                if (spot[1] != null)
                    return spot;
            }
            return null;
        }

        /**
         * Inserts a new {{copied}} template.
         * @param {[InsertPosition, HTMLElement]} spot The spot to place the template.
         */
        insertNewNotice(spot) {
            let [position, element] = spot;

            if (
                element.hasAttribute("about")
                && element.getAttribute("about").startsWith("#mwt")
            ) {
                const transclusionSet = this.document.querySelectorAll(
                    `[about="${element.getAttribute("about")}"]`
                );
                element = transclusionSet.item(transclusionSet.length - 1);
            }

            const template = document.createElement("span");
            template.setAttribute("about", `N${ParsoidDocument.addedRows++}`);
            template.setAttribute("typeof", "mw:Transclusion");
            template.setAttribute("data-mw", JSON.stringify({
                parts: [{
                    template: {
                        target: { wt: "copied\n", href: "./Template:Copied" },
                        params: {
                            to: {
                                wt: new mw.Title(parsoidDocument.page).getSubjectPage().getPrefixedText()
                            }
                        },
                        i: 0
                    }
                }]
            }));

            // Insert.
            element.insertAdjacentElement(position, template);
            this.findCopiedNotices();
            this.dispatchEvent(new Event("insert"));
        }

        /**
         * Converts the contents of this document to wikitext.
         * @returns {Promise<string>} The wikitext of this document.
         */
        async toWikitext() {
            let target = `/api/rest_v1/transform/html/to/wikitext/${
                encodeAPIComponent(this.page)
            }`;
            if (this.notFound === undefined) {
                target += `/${+(/(\d+)$/.exec(
                    this._document.documentElement.getAttribute("about")
                )[1])}`;
            }
            return fetch(
                target,
                {
                    method: "POST",
                    headers: {
                        "If-Match": this.notFound ? undefined : this.etag
                    },
                    body: (() => {
                        const data = new FormData();
                        data.set("html", this.document.documentElement.outerHTML);
                        data.set("scrub_wikitext", "true");
                        data.set("stash", "true");

                        return data;
                    })()
                }
            ).then(data => data.text());
        }

    }
    ParsoidDocument.addedRows = 1;
    /**
     * Extremely minimalist valid Parsoid document. This includes a section 0
     * element for findCopiedNoticeSpot.
     * @type {string}
     */
    ParsoidDocument.defaultDocument =
        "<html><body><section data-mw-section-id=\"0\"></section></body></html>";

    // ============================== SINGLETONS ==============================

    /**
     * {@link ParsoidDocument} singleton.
     * @type {ParsoidDocument}
     */
    const parsoidDocument = new ParsoidDocument();

    /**
     * The WindowManager for this userscript.
     */
    const windowManager = new OO.ui.WindowManager();
    document.body.appendChild(windowManager.$element[0]);

    // =============================== DIALOGS ================================

    /**
     * @param {CopiedTemplate} copiedTemplate
     *        The template that this page refers to.
     * @param {CopiedTemplateEditorDialog} parent
     *        The parent of this page.
     */
    function CopiedTemplatePage(copiedTemplate, parent) {
        const config = {
            data: {
                copiedTemplate
            },
            label: `Copied ${copiedTemplate.name}`,
            icon: "puzzle",
            level: 0,
            classes: ["cte-page-template"]
        };
        this.name = `${copiedTemplate.element.getAttribute("about")}-${copiedTemplate.i}`;

        copiedTemplate.addEventListener("add", (event) => {
            // Find the last row's page in the layout.
            const lastPage =
                // Get the last row's page (or this page if we don't have a thing)
                parent.layout.getPage(
                    copiedTemplate.rows.length === 1 ?
                        this.name
                        : copiedTemplate.rows[copiedTemplate.rows.length - 2].id
                );
            const lastPageIndex =
                parent.layout.stackLayout.getItems().indexOf(lastPage);
            parent.layout.addPages([
                new CopiedTemplateRowPage(event.row, parent)
            ], lastPageIndex + 1);
        });
        copiedTemplate.addEventListener("destroy", () => {
            // Check if we haven't been deleted yet.
            if (parent.layout.getPage(this.name))
                parent.layout.removePages([this]);
        });

        Object.assign(this, config);
        CopiedTemplatePage.super.call(this, this.name, config);

        // HEADER

        const header = document.createElement("h3");
        header.innerText = this.label;

        // BUTTONS

        const buttonSet = document.createElement("div");
        const mergeButton = new OO.ui.ButtonWidget({
            icon: "tableMergeCells",
            title: "Merge",
            framed: false
        });
        const deleteButton = new OO.ui.ButtonWidget({
            icon: "trash",
            title: "Remove template",
            framed: false,
            flags: ["destructive"]
        });
        deleteButton.on("click", () => {
            if (copiedTemplate.rows.length > 0) {
                OO.ui.confirm(
                    `This will destroy ${copiedTemplate.rows.length} entr${
                        // shitty i18n go brrr
                        copiedTemplate.rows.length === 1 ? "y" : "ies"
                    }. Continue?`
                ).done((confirmed) => {
                    if (confirmed) {
                        copiedTemplate.destroy();
                    }
                });
            } else {
                copiedTemplate.destroy();
            }
        });
        const addButton = new OO.ui.ButtonWidget({
            label: "Add row"
        });
        addButton.on("click", () => {
            copiedTemplate.addRow(new CopiedTemplateRow({
                to: new mw.Title(parsoidDocument.page).getSubjectPage().getPrefixedText()
            }, copiedTemplate));
        });
        buttonSet.style.float = "right";
        buttonSet.appendChild(mergeButton.$element[0]);
        buttonSet.appendChild(deleteButton.$element[0]);
        buttonSet.appendChild(addButton.$element[0]);

        const mergePanel = new OO.ui.FieldsetLayout({
            icon: "tableMergeCells",
            label: "Merge templates"
        });
        mergePanel.$element[0].style.padding = "16px";
        mergePanel.$element[0].style.zIndex = "20";
        mergePanel.toggle(false);
        const mergeTarget = new OO.ui.DropdownInputWidget({
            $overlay: true,
            label: "Select a template"
        });
        const mergeTargetButton = new OO.ui.ButtonWidget({
            label: "Merge"
        });
        mergeTargetButton.on("click", () => {
            const template = parsoidDocument.copiedNotices.find(v => v.name === mergeTarget.value);
            if (template) {
                copiedTemplate.merge(template, { delete: true });
                mergeTarget.setValue(null);
                mergePanel.toggle(false);
            }
        });
        mergePanel.addItems(new OO.ui.ActionFieldLayout(
            mergeTarget,
            mergeTargetButton,
            {
                label: "Template to merge",
                align: "left"
            }
        ));
        mergeButton.on("click", () => {
            mergePanel.toggle();
        });
        const mergeAllButton = new OO.ui.ButtonWidget({
            label: "Merge all",
            flags: ["progressive"]
        });
        mergeAllButton.on("click", () => {
            OO.ui.confirm(`You are about to merge ${
                parsoidDocument.copiedNotices.length - 1
            } templates into this template. Continue?`).done((confirmed) => {
                if (confirmed) {
                    while (parsoidDocument.copiedNotices.length > 1) {
                        let template = parsoidDocument.copiedNotices[0];
                        if (template === copiedTemplate)
                            template = parsoidDocument.copiedNotices[1];
                        copiedTemplate.merge(template, { delete: true });
                    }
                    mergeTarget.setValue(null);
                    mergePanel.toggle(false);
                }
            });
        });
        mergePanel.$element.append(mergeAllButton.$element[0]);
        const recalculateOptions = () => {
            const options = [];
            for (const notice of parsoidDocument.copiedNotices) {
                if (notice === copiedTemplate)
                    continue;
                options.push({
                    data: notice.name,
                    label: `Copied ${notice.name}`
                });
            }
            if (options.length === 0) {
                options.push({ data: null, label: "No templates to merge.", disabled: true });
                mergeTargetButton.setDisabled(true);
                mergeAllButton.setDisabled(true);
            } else {
                mergeTargetButton.setDisabled(false);
                mergeAllButton.setDisabled(false);
            }
            mergeTarget.setOptions(options);
        };
        mergePanel.on("toggle", recalculateOptions);

        // PREVIEW

        const previewPanel = document.createElement("div");
        previewPanel.classList.add("cte-preview")
        this.preview = {
            willUpdate: true,
            lastUpdate: 0,
            update: async () => {
                const start = Date.now();
                await copiedTemplate.generatePreview().then((data) => {
                    if (this.preview.lastUpdate < start) {
                        previewPanel.innerHTML = data;
                        this.preview.lastUpdate = start;

                        // Trigger collapsibles
                        // noinspection JSCheckFunctionSignatures
                        $(previewPanel).find(".collapsible").makeCollapsible();
                    }
                });
            }
        }
        this.preview.interval = setInterval(async () => {
            if (this.preview.willUpdate) {
                this.preview.willUpdate = false;
                await this.preview.update();
            }
        }, 1000);
        copiedTemplate.addEventListener("destroy", () => {
            clearInterval(this.preview.interval);
        });
        copiedTemplate.addEventListener("save", () => { this.preview.willUpdate = true; });

        // OPTIONS

        this.inputSet = {
            collapse: new OO.ui.CheckboxInputWidget({
                value: copiedTemplate.collapsed
            }),
            small: new OO.ui.CheckboxInputWidget({
                value: copiedTemplate.small
            }),
        };
        this.fields = {
            collapse: new OO.ui.FieldLayout(this.inputSet.collapse, {
                label: "Collapse",
                align: "inline"
            }),
            small: new OO.ui.FieldLayout(this.inputSet.small, {
                label: "Small",
                align: "inline"
            })
        };
        this.inputSet.collapse.on("change", (value) => {
            copiedTemplate.collapsed = value;
            copiedTemplate.save();
        });
        this.inputSet.small.on("change", (value) => {
            copiedTemplate.small = value;
            copiedTemplate.save();
        });
        const templateOptions = document.createElement("div");
        templateOptions.classList.add("cte-temop");
        const to_1 = document.createElement("div");
        to_1.appendChild(this.fields.collapse.$element[0]);
        const to_2 = document.createElement("div");
        to_2.appendChild(this.fields.small.$element[0]);
        templateOptions.append(to_1, to_2);

        /** @var any */
        this.$element.append(
            buttonSet, header, mergePanel.$element, previewPanel, templateOptions
        );
    }
    OO.inheritClass(CopiedTemplatePage, OO.ui.PageLayout);
    // noinspection JSUnusedGlobalSymbols
    CopiedTemplatePage.prototype.setupOutlineItem = function () {
        /** @var any */
        if (this.outlineItem !== undefined) {
            /** @var any */
            this.outlineItem
                .setMovable(true)
                .setRemovable(true)
                .setIcon(this.icon)
                .setLevel(this.level)
                .setLabel(this.label)
        }
    }

    /**
     * @param {CopiedTemplateRow} copiedTemplateRow
     *        The template that this page refers to.
     * @param {CopiedTemplateEditorDialog} parent
     *        The parent of this page.
     */
    function CopiedTemplateRowPage(copiedTemplateRow, parent) {
        const config = {
            data: {
                copiedTemplateRow
            },
            label: `${copiedTemplateRow.from || "???"} to ${copiedTemplateRow.to || "???"}`,
            icon: "parameter",
            level: 1,
            classes: ["cte-page-row"]
        };
        this.name = copiedTemplateRow.id;

        copiedTemplateRow.parent.addEventListener("destroy", () => {
            // Check if the page hasn't been deleted yet.
            if (parent.layout.getPage(this.name))
                parent.layout.removePages([this]);
        });
        copiedTemplateRow.parent.addEventListener("delete", (event) => {
            if (event.row.id === this.name)
                parent.layout.removePages([this]);
        });

        Object.assign(this, config);
        CopiedTemplateRowPage.super.call(this, this.name, config);

        const buttonSet = document.createElement("div");
        const deleteButton = new OO.ui.ButtonWidget({
            icon: "trash",
            title: "Remove template",
            framed: false,
            flags: ["destructive"]
        });
        deleteButton.on("click", () => {
            copiedTemplateRow.parent.deleteRow(copiedTemplateRow);
        });
        const copyButton = new OO.ui.ButtonWidget({
            icon: "quotes",
            title: "Copy attribution edit summary",
            framed: false
        });
        copyButton.on("click", () => {
            let attributionString = "Attribution: Content partially copied";
            let lacking = false;
            if (copiedTemplateRow.from != null && copiedTemplateRow.from.length !== 0) {
                attributionString += ` from [[${copiedTemplateRow.from}]]`;
            } else {
                lacking = true;
                if (copiedTemplateRow.from_oldid != null)
                    attributionString += " from a page";
            }
            if (copiedTemplateRow.from_oldid != null) {
                attributionString += ` as of revision [[Special:Diff/${
                    copiedTemplateRow.from_oldid
                }|${
                    copiedTemplateRow.from_oldid
                }]]`;
            }
            if (copiedTemplateRow.to_diff != null || copiedTemplateRow.to_oldid != null) {
                // Shifting will ensure that `to_oldid` will be used if `to_diff` is missing.
                const diffPart1 = copiedTemplateRow.to_oldid || copiedTemplateRow.to_diff;
                const diffPart2 = copiedTemplateRow.to_diff || copiedTemplateRow.to_oldid;

                attributionString += ` with [[Special:Diff/${
                    diffPart1 === diffPart2 ? diffPart1 : `${diffPart1}/${diffPart2}`
                }|this edit]]`;
            }
            if (copiedTemplateRow.from != null && copiedTemplateRow.from.length !== 0) {
                attributionString += `; refer to that page's [[Special:PageHistory/${
                    copiedTemplateRow.from
                }|edit history]] for additional attribution`;
            }
            attributionString += ".";

            navigator.clipboard.writeText(
                attributionString
            ).then(function () {
                if (lacking) {
                    mw.notify(
                        "Attribution edit summary copied to clipboard with lacking properties. Ensure that `from` is supplied.",
                        { title: "{{copied}} Template Editor", type: "warn" }
                    );
                } else {
                    mw.notify(
                        "Attribution edit summary copied to clipboard.",
                        { title: "{{copied}} Template Editor" }
                    );
                }
            });
        });
        buttonSet.style.float = "right";
        buttonSet.style.position = "absolute";
        buttonSet.style.top = "0.5em";
        buttonSet.style.right = "0.5em";
        buttonSet.appendChild(copyButton.$element[0]);
        buttonSet.appendChild(deleteButton.$element[0]);

        const parsedDate = copiedTemplateRow.date == null || copiedTemplateRow.date.trim().length === 0 ?
            undefined : (!isNaN(new Date(copiedTemplateRow.date.trim() + " UTC").getTime()) ?
                (new Date(copiedTemplateRow.date.trim() + " UTC")) : (
                    !isNaN(new Date(copiedTemplateRow.date.trim()).getTime()) ?
                        new Date(copiedTemplateRow.date.trim()) : null
                ))

        this.layout = new OO.ui.FieldsetLayout({
            icon: "parameter",
            label: "Template row",
            classes: [ "cte-fieldset" ]
        });
        this.inputs = {
            from: new mw.widgets.TitleInputWidget({
                $overlay: parent["$overlay"],
                placeholder: "Page A",
                value: copiedTemplateRow.from,
                validate: /^.+$/g
            }),
            from_oldid: new OO.ui.TextInputWidget({
                placeholder: "from_oldid",
                value: copiedTemplateRow.from_oldid,
                validate: /^\d*$/
            }),
            to: new mw.widgets.TitleInputWidget({
                $overlay: parent["$overlay"],
                placeholder: "Page B",
                value: copiedTemplateRow.to
            }),
            to_diff: new OO.ui.TextInputWidget({
                placeholder: "to_diff",
                value: copiedTemplateRow.to_diff,
                validate: /^\d*$/
            }),

            // Advanced options
            to_oldid: new OO.ui.TextInputWidget({
                placeholder: "to_oldid",
                value: copiedTemplateRow.to_oldid,
                validate: /^\d*$/
            }),
            diff: new OO.ui.TextInputWidget({
                placeholder: "https://en.wikipedia.org/w/index.php?diff=123456",
                value: copiedTemplateRow.diff
            }),
            merge: new OO.ui.CheckboxInputWidget({
                value: copiedTemplateRow.merge !== undefined
            }),
            afd: new OO.ui.TextInputWidget({
                placeholder: "AfD page (without Wikipedia:Articles for deletion/)",
                value: copiedTemplateRow.afd,
                disabled: copiedTemplateRow.merge === undefined,
                // Prevent people from adding the WP:AFD prefix.
                validate: /^(?!W(iki)?p(edia)?:(A(rticles)?[ _]?f(or)?[ _]?d(eletion)?\/)).+/gi
            }),
            date: new mw.widgets.datetime.DateTimeInputWidget({
                // calendar: {
                //     $overlay: parent["$overlay"]
                // },
                calendar: null,
                icon: "calendar",
                clearable: true,
                value: parsedDate
            }),
            toggle: new OO.ui.ToggleSwitchWidget()
        };

        const diffConvert = new OO.ui.ButtonWidget({
            label: "Convert"
        });
        // const dateButton = new OO.ui.PopupButtonWidget({
        //     icon: "calendar",
        //     title: "Select a date"
        // });

        this.fieldLayouts = {
            from: new OO.ui.FieldLayout(this.inputs.from, {
                $overlay: parent["$overlay"],
                label: "Page copied from",
                align: "top",
                help: "This is the page from which the content was copied from."
            }),
            from_oldid: new OO.ui.FieldLayout(this.inputs.from_oldid, {
                $overlay: parent["$overlay"],
                label: "Revision ID",
                align: "left",
                help: "The specific revision ID at the time that the content was copied, if known."
            }),
            to: new OO.ui.FieldLayout(this.inputs.to, {
                $overlay: parent["$overlay"],
                label: "Page copied to",
                align: "top",
                help: "This is the page where the content was copied into."
            }),
            to_diff: new OO.ui.FieldLayout(this.inputs.to_diff, {
                $overlay: parent["$overlay"],
                label: "Revision ID",
                align: "left",
                help: "The specific revision ID of the revision that copied content into the target page. If the copying spans multiple revisions, this is the ID of the last revision that copies content into the page."
            }),

            // Advanced options
            to_oldid: new OO.ui.FieldLayout(this.inputs.to_oldid, {
                $overlay: parent["$overlay"],
                label: "Starting revision ID",
                align: "left",
                help: "The ID of the revision before any content was copied. This can be omitted unless multiple revisions copied content into the page."
            }),
            diff: new OO.ui.ActionFieldLayout(this.inputs.diff, diffConvert, {
                $overlay: parent["$overlay"],
                label: "URL to diff",
                align: "inline",
                help: new OO.ui.HtmlSnippet(
                    "The URL of the diff. Using <code>to_diff</code> and <code>to_oldid</code> is preferred, although supplying this parameter will override both."
                )
            }),
            merge: new OO.ui.FieldLayout(this.inputs.merge, {
                $overlay: parent["$overlay"],
                label: "Merged",
                align: "inline",
                help: "Whether copying was done from merging two pages."
            }),
            afd: new OO.ui.FieldLayout(this.inputs.afd, {
                $overlay: parent["$overlay"],
                label: "AfD",
                align: "left",
                help: "The AfD page if the copy was made due to an AfD closed as \"merge\"."
            }),
            date: new OO.ui.FieldLayout(this.inputs.date, {
                align: "inline",
                classes: ["cte-fieldset-date"]
            }),
            toggle: new OO.ui.FieldLayout(this.inputs.toggle, {
                label: "Advanced",
                align: "inline",
                classes: ["cte-fieldset-advswitch"]
            })
        };

        if (parsedDate === null) {
            this.fieldLayouts.date.setWarnings([
                `The previous date value, "${copiedTemplateRow.date}", was not a valid date.`
            ]);
        }

        const advancedOptions = [
            this.fieldLayouts.to_oldid,
            this.fieldLayouts.diff,
            this.fieldLayouts.merge,
            this.fieldLayouts.afd
        ];

        // Self-imposed deprecation notice in order to steer away from plain URL diff links.
        // This will, in the long term, make it easier to parse out and edit {{copied}} templates.
        const diffDeprecatedNotice = new OO.ui.HtmlSnippet(
            "The <code>to_diff</code> and <code>to_oldid</code> parameters are preferred in favor of the <code>diff</code> parameter."
        );

        // Hide advanced options
        advancedOptions.forEach(e => {
            e.toggle(false);
        });
        // ...except for `diff` if it's supplied (legacy reasons)
        if (copiedTemplateRow.diff) {
            this.fieldLayouts.diff.toggle(true);
            this.fieldLayouts.diff.setWarnings([diffDeprecatedNotice]);
        } else {
            diffConvert.setDisabled(true);
        }
        this.inputs.diff.on("change", () => {
            if (this.inputs.diff.getValue().length > 0) {
                try {
                    // Check if this is an English Wikipedia diff URL.
                    if (new URL(this.inputs.diff.getValue(), window.location.href).hostname === "en.wikipedia.org") {
                        // Prefer `to_oldid` and `to_diff`
                        this.fieldLayouts.diff.setWarnings([diffDeprecatedNotice]);
                        diffConvert.setDisabled(false);
                    } else {
                        this.fieldLayouts.diff.setWarnings([]);
                        diffConvert.setDisabled(true);
                    }
                } catch (e) {
                    // Clear warnings just to be safe.
                    this.fieldLayouts.diff.setWarnings([]);
                    diffConvert.setDisabled(true);
                }
            } else {
                this.fieldLayouts.diff.setWarnings([]);
                diffConvert.setDisabled(true);
            }
        });

        this.inputs.merge.on("change", (value) => {
            this.inputs.afd.setDisabled(!value);
        })
        this.inputs.toggle.on("change", (value) => {
            advancedOptions.forEach(e => {
                e.toggle(value);
            });
            this.fieldLayouts.to_diff.setLabel(
                value ? "Ending revision ID" : "Revision ID"
            );
        });
        this.inputs.from.on("change", () => {
            /** @var any */
            this.outlineItem.setLabel(
                `${this.inputs.from.value || "???"} to ${this.inputs.to.value || "???"}`
            );
        });
        this.inputs.to.on("change", () => {
            /** @var any */
            this.outlineItem.setLabel(
                `${this.inputs.from.value || "???"} to ${this.inputs.to.value || "???"}`
            );
        });
        for (const [field, input] of Object.entries(this.inputs)) {
            if (field === "toggle")
                continue;
            input.on("change", (value) => {
                if (input instanceof OO.ui.CheckboxInputWidget) {
                    copiedTemplateRow[field] = value ? "yes" : "";
                } else if (input instanceof mw.widgets.datetime.DateTimeInputWidget) {
                    copiedTemplateRow[field] = value.replace(/T.+/g, "");
                    if (value.length > 0) {
                        this.fieldLayouts[field].setWarnings([]);
                    }
                } else {
                    copiedTemplateRow[field] = value;
                }
                copiedTemplateRow.parent.save();
            });
            if (input instanceof OO.ui.TextInputWidget)
                input.setValidityFlag();
        }

        diffConvert.on("click", () => {
            const diff = this.inputs.diff;
            const value = diff.getValue();
            try {
                const url = new URL(value, window.location.href)
                if (value) {
                    if (url.hostname === "en.wikipedia.org") {
                        let oldid = url.searchParams.get("oldid");
                        let diff = url.searchParams.get("diff");
                        const title = url.searchParams.get("title");

                        const diffSpecialPageCheck =
                            /\/wiki\/Special:Diff\/(prev|next|\d+)(?:\/(prev|next|\d+))?/.exec(url.pathname);
                        if (diffSpecialPageCheck != null) {
                            if (
                                diffSpecialPageCheck[1] != null
                                && diffSpecialPageCheck[2] == null
                            ) {
                                diff = diffSpecialPageCheck[1];
                            } else if (
                                diffSpecialPageCheck[1] != null
                                && diffSpecialPageCheck[2] != null
                            ) {
                                oldid = diffSpecialPageCheck[1];
                                diff = diffSpecialPageCheck[2];
                            }
                        }

                        const confirmProcess = new OO.ui.Process();
                        for (const [rowname, value] of [
                            ["to_oldid", oldid],
                            ["to_diff", diff],
                            ["to", title]
                        ]) {
                            if (value == null) continue;
                            if (
                                copiedTemplateRow[rowname] != null
                                && copiedTemplateRow[rowname].length > 0
                                && copiedTemplateRow[rowname] !== value
                            ) {
                                confirmProcess.next(async () => {
                                    const confirmPromise = OO.ui.confirm(
                                        `The current value of ${
                                            rowname
                                        }, "${
                                            copiedTemplateRow[rowname]
                                        }", will be replaced with "${
                                            value
                                        }". Replace?`
                                    );
                                    confirmPromise.done((confirmed) => {
                                        if (confirmed)
                                            this.inputs[rowname].setValue(value);
                                    });
                                    return confirmPromise;
                                });
                            } else {
                                this.inputs[rowname].setValue(value);
                            }
                        }
                        confirmProcess.next(() => {
                            copiedTemplateRow.parent.save();
                            this.inputs.diff.setValue("");

                            if (!this.inputs.toggle.getValue()) {
                                this.fieldLayouts.diff.toggle(false);
                            }
                        });
                        confirmProcess.execute();
                    } else {
                        console.warn("Attempted to convert a non-enwiki page.");
                    }
                }
            } catch (e) {
                console.error("Cannot convert `diff` parameter to URL.", e);
                OO.ui.alert("Cannot convert `diff` parameter to URL. See your browser console for more details.");
            }
        });

        // Append
        this.layout.$element.append(buttonSet);
        this.layout.addItems(Object.values(this.fieldLayouts));

        /** @var any */
        this.$element.append(this.layout.$element);
    }
    OO.inheritClass(CopiedTemplateRowPage, OO.ui.PageLayout);
    // noinspection JSUnusedGlobalSymbols
    CopiedTemplateRowPage.prototype.setupOutlineItem = function () {
        /** @var any */
        if (this.outlineItem !== undefined) {
            /** @var any */
            this.outlineItem
                .setMovable(true)
                .setRemovable(true)
                .setIcon(this.icon)
                .setLevel(this.level)
                .setLabel(this.label)
        }
    }

    /**
     * The page for empty editors.
     * @param {CopiedTemplateEditorDialog} parent
     */
    function CopiedTemplatesEmptyPage(parent) {
        const config = {
            label: `No templates`,
            icon: "puzzle",
            level: 0
        };
        this.name = "cte-no-templates";

        const addListener = parent.layout.on("add", () => {
            for (const name of Object.keys(parent.layout.pages)) {
                /** @var any */
                if (name !== this.name && this.outlineItem !== null) {
                    // Pop this page out if a page exists.
                    parent.layout.removePages([this]);
                    parent.layout.off(addListener);
                    return;
                }
            }
        });

        Object.assign(this, config);
        CopiedTemplateRowPage.super.call(this, this.name, config);

        const header = document.createElement("h3");
        header.innerText = "No {{copied}} templates"
        const subtext = document.createElement("p");
        subtext.innerText = parsoidDocument.originalNoticeCount > 0 ?
            "All {{copied}} templates will be removed from the page. To reset your changes and restore, " +
            "previous templates, press the reset button at the bottom of the dialog."
            : "There are currently no {{copied}} templates on the talk page."
        const add = new OO.ui.ButtonWidget({
            icon: "add",
            label: "Add a template",
            flags: [ "progressive" ]
        });
        add.on("click", () => {
            parent.addTemplate();
        });

        /** @var any */
        this.$element.append(header, subtext, add.$element);
    }
    OO.inheritClass(CopiedTemplatesEmptyPage, OO.ui.PageLayout);
    // noinspection JSUnusedGlobalSymbols
    CopiedTemplatesEmptyPage.prototype.setupOutlineItem = function () {
        /** @var any */
        if (this.outlineItem !== undefined) {
            /** @var any */
            this.outlineItem
                .setMovable(true)
                .setRemovable(true)
                .setIcon(this.icon)
                .setLevel(this.level)
                .setLabel(this.label)
        }
    }

    function CopiedTemplateEditorDialog(config) {
        CopiedTemplateEditorDialog.super.call(this, config);
    }
    OO.inheritClass(CopiedTemplateEditorDialog, OO.ui.ProcessDialog);

    CopiedTemplateEditorDialog.static.name = "copiedTemplateEditorDialog";
    CopiedTemplateEditorDialog.static.title = "{{copied}} Template Editor"
    CopiedTemplateEditorDialog.static.size = "larger";
    CopiedTemplateEditorDialog.static.actions = [
        {
            flags: ["primary", "progressive"],
            label: "Save",
            title: "Save",
            action: "save"
        },
        {
            flags: ["safe", "close"],
            icon: "close",
            label: "Close",
            title: "Close",
            invisibleLabel: true,
            action: "close"
        },
        {
            action: "add",
            icon: "add",
            label: "Add a template",
            title: "Add a template",
            invisibleLabel: true
        },
        {
            action: "merge",
            icon: "tableMergeCells",
            label: "Merge all templates",
            title: "Merge all templates",
            invisibleLabel: true
        },
        {
            action: "reset",
            icon: "reload",
            label: "Reset everything",
            title: "Reset everything",
            invisibleLabel: true,
            flags: ["destructive"]
        },
        {
            action: "delete",
            icon: "trash",
            label: "Delete all templates",
            title: "Delete all templates",
            invisibleLabel: true,
            flags: ["destructive"]
        }
    ];

    // noinspection JSUnusedGlobalSymbols
    CopiedTemplateEditorDialog.prototype.getBodyHeight = function () {
        return 500;
    };

    CopiedTemplateEditorDialog.prototype.initialize = function() {
        CopiedTemplateEditorDialog.super.prototype.initialize.apply(this, arguments);

        this.layout = new OO.ui.BookletLayout({
            continuous: true,
            outlined: true
        });

        this.layout.on("remove", () => {
            if (Object.keys(this.layout.pages).length === 0) {
                this.layout.addPages([new CopiedTemplatesEmptyPage(this)], 0);
            }
        });

        parsoidDocument.addEventListener("insert", () => {
            this.rebuildPages();
        });

        this.content = this.layout;
        /** @var any */
        this.$body.append(this.content.$element);
    }

    CopiedTemplateEditorDialog.prototype.rebuildPages = function () {
        const pages = [];
        for (const template of parsoidDocument.copiedNotices) {
            if (template.rows === undefined)
                // Likely deleted. Skip.
                continue;
            pages.push(new CopiedTemplatePage(template, this));
            for (const row of template.rows) {
                pages.push(new CopiedTemplateRowPage(row, this));
            }
        }
        this.layout.clearPages();
        this.layout.addPages(pages);
    }

    CopiedTemplateEditorDialog.prototype.addTemplate = function () {
        const spot = parsoidDocument.findCopiedNoticeSpot();
        if (spot === null) {
            // Not able to find a spot. Should theoretically be impossible since
            // there is a catch-all "beforebegin" section 0 spot.
            OO.ui.notify(
                "Sorry, but a {{copied}} template cannot be automatically added. " +
                "Please contact the developer to possibly add support for this talk page."
            );
        } else {
            parsoidDocument.insertNewNotice(spot);
        }
    }

    CopiedTemplateEditorDialog.prototype.getSetupProcess = function (data) {
        const process = CopiedTemplateEditorDialog.super.prototype.getSetupProcess.call(this, data);
        if (!parsoidDocument.built)
            process.first(function() {
                document.body.appendChild(parsoidDocument.buildFrame());
            });
        if (parsoidDocument.loaded)
            process.first(function () {
                return OO.ui.alert(
                    "This dialog did not close properly last time. Your changes will be reset."
                ).done(() => {
                    parsoidDocument.resetFrame();
                });
            });
        process.next(function () {
            return parsoidDocument.loadFrame(
                new mw.Title(mw.config.get("wgPageName")).getTalkPage().getPrefixedText()
            ).catch(errorToOO);
        });
        process.next(() => {
            return this.rebuildPages.call(this);
        });

        process.next(() => {
            window.addEventListener("beforeunload", exitBlock);
        });

        return process;
    }

    CopiedTemplateEditorDialog.prototype.getActionProcess = function (action) {
        const process = CopiedTemplateEditorDialog.super.prototype.getActionProcess.call(this, action);
        switch (action) {
            case "save":
                // Quick and dirty validity check.
                if (this.content.$element[0].querySelector(".oo-ui-flaggedElement-invalid") == null) {
                    return new OO.ui.Process(() => {
                        OO.ui.alert("Some fields are still invalid.");
                    });
                }

                process.next(async function () {
                    const action = parsoidDocument.originalNoticeCount > 0 ? "Modifying" : "Adding";
                    return new mw.Api().postWithEditToken({
                        action: "edit",
                        format: "json",
                        formatversion: "2",
                        utf8: "true",
                        title: parsoidDocument.page,
                        text: await parsoidDocument.toWikitext(),
                        summary: `${action} {{[[Template:Copied|copied]]}} templates ${advert}`
                    }).catch(errorToOO);
                }, this);
                process.next(function () {
                    window.removeEventListener("beforeunload", exitBlock);
                    if (mw.config.get("wgPageName") === parsoidDocument.page) {
                        window.location.reload();
                    } else {
                        window.location.href =
                            mw.config.get("wgArticlePath").replace(/\$1/g, parsoidDocument.page)
                    }
                }, this);
                break;
            case "reset":
                process.next(function () {
                    return OO.ui.confirm(
                        "This will reset all changes. Proceed?"
                    ).done((confirmed) => {
                        if (confirmed) {
                            parsoidDocument.reloadFrame().then(() => {
                                this.layout.clearPages();
                                this.rebuildPages.call(this);
                            });
                        }
                    });
                }, this);
                break;
            case "merge":
                process.next(function () {
                    const notices = parsoidDocument.copiedNotices.length;
                    if (notices > 1) {
                        return OO.ui.confirm(
                            `You are about to merge ${
                                notices
                            } template${notices !== 1 ? "s" : ""}. Are you sure?`
                        ).done((confirmed) => {
                            if (confirmed) {
                                const pivot = parsoidDocument.copiedNotices[0];
                                while (parsoidDocument.copiedNotices.length > 1) {
                                    let template = parsoidDocument.copiedNotices[0];
                                    if (template === pivot)
                                        template = parsoidDocument.copiedNotices[1];
                                    pivot.merge(template, { delete: true });
                                }
                            }
                        });
                    } else {
                        return OO.ui.alert("There are no templates to merge.");
                    }
                }, this);
                break;
            case "delete":
                process.next(function () {
                    const notices = parsoidDocument.copiedNotices.length;
                    const rows = parsoidDocument.copiedNotices.reduce((p, n) => p + n.rows.length, 0);
                    return OO.ui.confirm(
                        `You are about to delete ${
                            notices
                        } template${notices !== 1 ? "s" : ""}, containing ${
                            rows
                        } entr${rows !== 1 ? "ies" : "y"} in total. Are you sure?`
                    ).done((confirmed) => {
                        if (confirmed) {
                            while (parsoidDocument.copiedNotices.length > 0) {
                                parsoidDocument.copiedNotices[0].destroy();
                            }
                        }
                    });
                }, this);
                break;
            case "add":
                process.next(function () {
                    this.addTemplate();
                }, this);
                break;
        }

        if (action === "save" || action === "close") {
            process.next(function () {
                this.close({ action: action });
                window.removeEventListener("beforeunload", exitBlock);
                parsoidDocument.resetFrame();
                parsoidDocument.destroyFrame();

                window.CopiedTemplateEditor.toggleButtons(true);
            }, this);
        }

        return process;
    }

    CopiedTemplateEditorDialog.prototype.getTeardownProcess = function (data) {
        /** @var any */
        return CopiedTemplateEditorDialog.super.prototype.getTeardownProcess.call(this, data);
    }

    // ============================== INITIALIZE ==============================

    function openEditDialog() {
        const dialog = new CopiedTemplateEditorDialog({
            classes: ["copied-template-editor"]
        });
        windowManager.addWindows([ dialog ]);
        windowManager.openWindow(dialog);
    }

    // Expose classes and variables for integration.
    window.CopiedTemplateEditor = window.CopiedTemplateEditor || {
        startButtons: [],
        /**
         * Toggle the edit buttons.
         * @param {boolean|null} state The new state.
         */
        toggleButtons: function (state) {
            for (const button of window.CopiedTemplateEditor.startButtons)
                button.setDisabled(state == null ? !button.isDisabled() : !state);
        }
    };
    Object.assign(window.CopiedTemplateEditor, {
        loaded: true,
        startButtons: window.CopiedTemplateEditor.startButtons || [],
        CopiedTemplate: CopiedTemplate,
        ParsoidDocument: ParsoidDocument,
        parsoidDocument: parsoidDocument,
        openEditDialog: openEditDialog
    });

    if (document.getElementById("pt-cte") == null && mw.config.get("wgNamespaceNumber") >= 0) {
        mw.util.addPortletLink(
            "p-tb",
            "javascript:void(0)",
            "{{copied}} Template Editor",
            "pt-cte"
        ).addEventListener("click", function() {
            window.CopiedTemplateEditor.toggleButtons(false);
            openEditDialog();
        });
    }

    // Only run if this script wasn't loaded using the loader.
    if (!window.CopiedTemplateEditor || !window.CopiedTemplateEditor.loader) {
        mw.hook("wikipage.content").add(() => {
            // Find all {{copied}} templates and append our special button.
            // This runs on the actual document, not the Parsoid document.
            document.querySelectorAll(".copiednotice > tbody > tr").forEach(e => {
                if (e.classList.contains("cte-upgraded"))
                    return;
                e.classList.add("cte-upgraded");

                const startButton = new OO.ui.ButtonWidget({
                    icon: "edit",
                    title: "Modify {{copied}} notices for this page",
                    label: "Modify copied notices for this page"
                }).setInvisibleLabel(true);
                window.CopiedTemplateEditor.startButtons.push(startButton);
                const td = document.createElement("td");
                td.style.paddingRight = "0.9em";
                td.appendChild(startButton.$element[0]);
                e.appendChild(td);

                startButton.on("click", () => {
                    window.CopiedTemplateEditor.toggleButtons(false);
                    openEditDialog();
                });
            });
        });

        // Query parameter-based autostart
        if (/[?&]cte-autostart(=(1|yes|true|on)?(&|$)|$)/.test(window.location.search)) {
            window.CopiedTemplateEditor.toggleButtons(false);
            openEditDialog();
        }
    }

    document.dispatchEvent(new Event("cte:load"));

});
// </nowiki>
/*
 * Copyright 2021 Chlod
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Also licensed under the Creative Commons Attribution-ShareAlike 3.0
 * Unported License, a copy of which is available at
 *
 *     https://creativecommons.org/licenses/by-sa/3.0
 *
 */
