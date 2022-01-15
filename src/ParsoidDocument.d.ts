/**
 * An object containing an {@link HTMLIFrameElement} along with helper functions
 * to make manipulation easier.
 */
declare class ParsoidDocument extends EventTarget {

    /**
     * A blank Parsoid document, with a section 0.
     */
    static defaultDocument: string;

    /** The ETag of this iframe's content. */
    etag: string;
    /** The page currently loaded. */
    page: string;
    /** The {@link HTMLIFrameElement} of this ParsoidDocument */
    iframe: HTMLIFrameElement;

    /** The {@link Document} object of the iframe. */
    get document(): Document;
    /** Whether or not the frame has been built. */
    get built(): boolean;
    /** Whether or not the frame has a page loaded. */
    get loaded(): boolean;

    /**
     * Constructs and returns the {@link HTMLIFrameElement} for this class.
     */
    buildFrame(): HTMLIFrameElement;

    /**
     * Initializes the frame. The frame must have first been built with
     * {@link buildFrame}.
     * @param {string} page The page to load.
     */
    loadFrame(page: string): Promise<void>;

    /**
     * Destroys the frame and pops it off of the DOM (if inserted).
     * Silently fails if the frame has not yet been built.
     */
    destroyFrame(): void;

    /**
     * Clears the frame for a future reload.
     */
    resetFrame(): void;

    /**
     * Reloads the page. This will destroy any modifications made to the document.
     */
    reloadFrame(): Promise<void>;

    /**
     * Finds a template in the loaded document.
     * @param templateName The name of the template to look for.
     * @param hrefMode Use the href instead of the wikitext to search for templates.
     */
    findTemplate(templateName: string, hrefMode?: boolean);

    /**
     * Finds the element with the "data-mw" attribute containing the element
     * passed into the function.
     * @param element The element to find the parent of. This must
     *                be a member of the ParsoidDocument's document.
     */
    findParsoidNode(element: HTMLElement);

    /**
     * Converts the contents of this document to wikitext.
     * @returns The wikitext of this document.
     */
    toWikitext(): Promise<string>;

}
