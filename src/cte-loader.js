// noinspection ES6ConvertVarToLetConst

/*
 * Copied Template Editor - Loader Script
 *
 * This helper script will load in CTE's core functionality only when needed.
 * Since the copied template editor is a sizable script, it's best to optimize
 * load times by only loading components when we have to, so that we don't have
 * to repeatedly load in the entire script (along with UI and other utility
 * code) for every page you visit.
 *
 * NOTE: This file MUST be loadable in ES5.
 *
 * More information on the userscript itself can be found at [[WP:CTE]].
 */
// <nowiki>
mw.loader.using([
    // Minimal dependencies for faster loading times.
    "oojs-ui-core",
    "oojs-ui.styles.icons-editing-core",
    "mediawiki.notification",
    "mediawiki.util"
], async function() {
    var scriptPath = "/w/index.php?title=User:Chlod/Scripts/CopiedTemplateEditor-core.js&action=raw&ctype=text/javascript&maxage=7200";

    if (window.CopiedTemplateEditor || (window.CopiedTemplateEditor && window.CopiedTemplateEditor.loaded)) {
        // Already loaded?
        mw.notify("Please double check if you are loading the Copied Template Editor twice.");
        return;
    }

    // noinspection JSUnusedGlobalSymbols
    window.CopiedTemplateEditor = {
        /**
         * Whether CTE was loaded through the CTE loader or not.
         * @param {boolean} state The new state.
         */
        loader: true,
        startButtons: [],
        /**
         * Toggle the edit buttons.
         * @param {boolean|null} state The new state.
         */
        toggleButtons: function (state) {
            for (var buttonIndex in window.CopiedTemplateEditor.startButtons) {
                var button = window.CopiedTemplateEditor.startButtons[buttonIndex];
                button.setDisabled(state == null ? !button.isDisabled() : !state);
            }
        }
    };

    /**
     * Loads in the core script and opens the editing dialog.
     */
    function openEditDialog() {
        document.addEventListener("cte:load", function() {
            window.CopiedTemplateEditor.openEditDialog();
        });

        // Load the script and blastoff!
        // The core script uses ES6, so it has to be loaded through ResourceLoader.
        mw.loader.getScript(scriptPath)
            .catch(function (error) {
                console.error(error);
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
            });
    }

    mw.hook("wikipage.content").add(() => {
        // Find all {{copied}} templates and append our special button.
        document.querySelectorAll(".copiednotice > tbody > tr").forEach(function(e) {
            if (e.classList.contains("cte-upgraded"))
                return;
            e.classList.add("cte-upgraded");

            var startButton = new OO.ui.ButtonWidget({
                icon: "edit",
                title: "Modify {{copied}} notices for this page",
                label: "Modify copied notices for this page"
            }).setInvisibleLabel(true);
            window.CopiedTemplateEditor.startButtons.push(startButton);
            var td = document.createElement("td");
            td.style.paddingRight = "0.9em";
            td.appendChild(startButton.$element[0]);
            e.appendChild(td);

            startButton.on("click", function() {
                window.CopiedTemplateEditor.toggleButtons(false);
                openEditDialog();
            });
        });
    });

    if (mw.config.get("wgNamespaceNumber") >= 0) {
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
