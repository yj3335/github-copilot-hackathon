# Requirements Document

## Introduction

A cross-browser PDF toolkit extension that enables users to perform comprehensive PDF operations (extract, split, merge, delete pages, rotate, reorder, and more) entirely on their local machine. The system consists of three major components: (1) the browser extension itself with a rich UI for PDF manipulation, (2) a landing/download page hosted on Azure for extension distribution, and (3) the DevOps/cloud infrastructure for building, packaging, and distributing extension builds across Chrome, Firefox, Edge, and Safari.

All PDF processing occurs client-side using WebAssembly or JavaScript-based PDF libraries. No PDF content is ever transmitted to external servers, ensuring complete user privacy.

## Glossary

- **Extension**: The cross-browser PDF toolkit browser extension installed by the user
- **Popup_UI**: The small interface that appears when the user clicks the extension icon in the browser toolbar
- **Workspace_View**: The full-page PDF workspace interface opened in a dedicated browser tab for complex operations
- **PDF_Engine**: The local WebAssembly or JavaScript-based PDF processing library embedded within the extension
- **Landing_Page_Server**: The Azure-hosted containerized web application serving the extension download page
- **Distribution_API**: The backend API responsible for detecting user browser/OS and serving the correct extension package
- **Extension_Package**: A browser-specific build artifact (.crx for Chrome, .xpi for Firefox, .appx for Edge, .safariextz for Safari)
- **CDN**: Azure Content Delivery Network used to serve extension packages and static assets globally
- **CI_CD_Pipeline**: The automated build, test, and deployment pipeline for all components
- **CSP**: Content Security Policy headers and rules enforced by the extension and server
- **Manifest_V3**: The latest Chrome extension manifest format, also adopted by Edge and partially by Firefox
- **WebExtensions_API**: The cross-browser extension API standard supported by Chrome, Firefox, and Edge
- **Page_Thumbnail**: A rendered preview image of a single PDF page displayed in the workspace
- **Operation_Queue**: The ordered list of PDF operations a user has staged before executing them
- **Local_Storage**: Browser extension local storage used for saving user preferences and operation history

## Requirements

### Requirement 1: Local PDF File Loading

**User Story:** As a user, I want to load PDF files from my local machine into the extension, so that I can perform operations on them without uploading to any server.

#### Acceptance Criteria

1. WHEN the user selects a PDF file via the file picker dialog, THE Extension SHALL load the file into browser memory using the File API without transmitting any data externally
2. WHEN the user drags and drops a PDF file onto the Workspace_View, THE Extension SHALL accept the file and load it into browser memory
3. WHEN the user loads a PDF file, THE PDF_Engine SHALL parse the document and extract total page count, page dimensions, document title, author, creation date, and modification date within 3 seconds for files up to 50MB and within 10 seconds for files between 50MB and 200MB
4. IF the user attempts to load a file that does not have a .pdf extension or does not contain a valid PDF header signature, THEN THE Extension SHALL display an error message indicating only PDF files are supported
5. IF the user attempts to load a PDF file exceeding 200MB, THEN THE Extension SHALL display a warning indicating the file may cause performance issues and ask for confirmation before proceeding; IF the user confirms, THEN THE Extension SHALL proceed to load the file; IF the user declines, THEN THE Extension SHALL cancel the load operation and return to the previous state
6. WHEN a PDF file is loaded successfully, THE Extension SHALL display the filename, page count, and file size in the Workspace_View header

### Requirement 2: PDF Page Extraction

**User Story:** As a user, I want to extract specific pages from a PDF, so that I can save a subset of pages as a new PDF file.

#### Acceptance Criteria

1. WHEN the user selects one or more pages and chooses the extract operation, THE PDF_Engine SHALL create a new PDF containing only the selected pages within 3 seconds for documents up to 100 pages and within 10 seconds for documents up to 500 pages
2. THE PDF_Engine SHALL preserve the original page content byte-for-byte, including embedded fonts, vector graphics, annotations, and raster images in the extracted document
3. WHEN extraction is complete, THE Extension SHALL offer the user a download of the new PDF file via the browser download dialog
4. WHEN the user specifies a page range using text input (e.g., "1-3, 5, 7-9"), THE PDF_Engine SHALL parse the input, extract exactly those pages, and include them in the output PDF in the specified order, including duplicate pages if the same page number appears more than once
5. IF the user specifies an invalid page range (e.g., page numbers exceeding document length, zero, negative numbers, or non-numeric characters), THEN THE Extension SHALL highlight the invalid entries in the text input and display an error message indicating which entries are invalid and why
6. IF the user triggers the extract operation with no pages selected and no page range specified, THEN THE Extension SHALL display an error message indicating that at least one page must be selected for extraction

### Requirement 3: PDF Splitting

**User Story:** As a user, I want to split a PDF into multiple smaller PDFs, so that I can organize content into separate files.

#### Acceptance Criteria

1. WHEN the user chooses to split by page range and specifies ranges using text input (e.g., "1-3, 4-6, 7-10"), THE PDF_Engine SHALL generate one separate PDF file for each specified range in the order provided
2. WHEN the user chooses to split into equal parts and specifies a value N between 2 and the total page count, THE PDF_Engine SHALL divide the document into N segments of equal page count (with the last segment containing any remainder pages)
3. WHEN the user chooses to split at every N pages (where N is between 1 and one less than the total page count), THE PDF_Engine SHALL create separate PDFs each containing N pages, with the final PDF containing any remainder pages
4. WHEN splitting produces multiple files, THE Extension SHALL package them into a ZIP archive with each file named using the original filename followed by a segment number (e.g., "document_1.pdf", "document_2.pdf") and offer a single download via the browser download dialog
5. THE PDF_Engine SHALL preserve all page content, annotations, and formatting in each split output file
6. IF the user specifies an invalid split parameter (e.g., N equals zero, N exceeds total page count, overlapping page ranges, or page numbers exceeding document length), THEN THE Extension SHALL highlight the invalid input and display an error message indicating the specific validation failure

### Requirement 4: PDF Merging

**User Story:** As a user, I want to merge multiple PDF files into a single document, so that I can combine related content.

#### Acceptance Criteria

1. WHEN the user loads between 2 and 100 PDF files and selects the merge operation, THE PDF_Engine SHALL combine them into a single PDF in the user-specified order
2. THE Extension SHALL allow the user to reorder files via drag-and-drop before merging
3. WHEN merging is complete, THE Extension SHALL offer the merged PDF for download via the browser download dialog
4. THE PDF_Engine SHALL preserve all page content, embedded fonts, annotations, and formatting from each source file in the merged output
5. IF the combined size of all selected files exceeds 500MB, THEN THE Extension SHALL display an error message indicating the total size limit has been exceeded and suggesting the user reduce the number of files
6. IF any source file in the merge list is password-protected, THEN THE Extension SHALL prompt the user for that file's password before proceeding, and exclude the file from the merge if the user cancels the prompt

### Requirement 5: PDF Page Deletion

**User Story:** As a user, I want to delete specific pages from a PDF, so that I can remove unwanted content.

#### Acceptance Criteria

1. WHEN the user selects one or more pages and chooses the delete operation, THE PDF_Engine SHALL create a new PDF with the selected pages removed while preserving all content, annotations, and formatting on the remaining pages
2. WHEN the user chooses the delete operation, THE Extension SHALL display a confirmation dialog listing the page numbers to be removed before executing the deletion
3. IF the user cancels the confirmation dialog, THEN THE Extension SHALL abort the delete operation and leave the document unchanged
4. WHEN deletion is complete, THE Extension SHALL update the Workspace_View to display the modified document with updated Page_Thumbnails and page count
5. IF the user attempts to delete all pages from a document, THEN THE Extension SHALL prevent the operation and display an error indicating at least one page must remain

### Requirement 6: PDF Page Reordering

**User Story:** As a user, I want to reorder pages within a PDF, so that I can arrange content in my preferred sequence.

#### Acceptance Criteria

1. WHEN the user drags one or more selected Page_Thumbnails to a new position in the Workspace_View, THE Extension SHALL move the dragged pages to the drop position and shift surrounding thumbnails to reflect the updated page order
2. WHEN the user confirms the reorder operation, THE PDF_Engine SHALL generate a new PDF with pages in the updated sequence within 3 seconds for documents up to 100 pages
3. WHILE the user is dragging a Page_Thumbnail, THE Extension SHALL display page numbers that update within 100ms to reflect the prospective new order
4. THE PDF_Engine SHALL preserve all page content, embedded fonts, and annotations when reordering pages
5. IF the loaded PDF contains fewer than 2 pages, THEN THE Extension SHALL disable the reorder operation and display a message indicating that reordering requires at least 2 pages

### Requirement 7: PDF Page Rotation

**User Story:** As a user, I want to rotate individual pages in a PDF, so that I can correct page orientation.

#### Acceptance Criteria

1. WHEN the user selects a page and chooses a rotation option, THE PDF_Engine SHALL rotate the page by the specified angle (90°, 180°, or 270° clockwise)
2. WHEN the PDF_Engine completes a rotation operation, THE Extension SHALL update the affected Page_Thumbnail(s) within 1 second to reflect the new orientation
3. THE Extension SHALL allow the user to select multiple pages and apply the same rotation to all selected pages in a single operation
4. WHEN a rotation is applied, THE PDF_Engine SHALL preserve all page content, text, and annotations in the rotated output
5. IF the PDF_Engine fails to rotate one or more pages, THEN THE Extension SHALL display an error message indicating which pages could not be rotated and revert those pages to their pre-rotation state

### Requirement 8: Workspace Visual Interface

**User Story:** As a user, I want a visual workspace showing page thumbnails, so that I can see and interact with my PDF pages easily.

#### Acceptance Criteria

1. WHEN a PDF is loaded, THE Workspace_View SHALL render Page_Thumbnails for all pages in a scrollable grid layout, where each thumbnail preserves the original page aspect ratio and fits within a maximum bounding box of 200x260 pixels
2. THE Workspace_View SHALL display page numbers below each Page_Thumbnail
3. WHEN the user clicks a Page_Thumbnail, THE Extension SHALL apply a visible border or background change to the thumbnail to indicate selection, visually distinct from unselected thumbnails
4. WHEN the user Ctrl+Clicks (Cmd+Click on macOS) a Page_Thumbnail, THE Extension SHALL toggle that thumbnail's selection state without affecting other selections, and WHEN the user Shift+Clicks a Page_Thumbnail, THE Extension SHALL select all pages between the last individually clicked thumbnail and the Shift+Clicked thumbnail inclusive
5. WHEN the user double-clicks a Page_Thumbnail, THE Workspace_View SHALL display a full-size preview of that page in a modal overlay, and the user SHALL be able to dismiss the modal by clicking a close button, pressing the Escape key, or clicking outside the modal area
6. THE Workspace_View SHALL render Page_Thumbnails progressively, loading visible thumbnails first and rendering off-screen thumbnails on scroll
7. WHILE a PDF operation is in progress, THE Extension SHALL display a progress indicator showing the operation name and percentage complete

### Requirement 9: Extension Popup Interface

**User Story:** As a user, I want a quick-access popup when I click the extension icon, so that I can start common operations without opening the full workspace.

#### Acceptance Criteria

1. WHEN the user clicks the extension icon in the browser toolbar, THE Popup_UI SHALL display within 200ms
2. THE Popup_UI SHALL display buttons for the most common operations: Open PDF, Merge PDFs, and Open Workspace
3. WHEN the user clicks "Open Workspace", THE Extension SHALL open the Workspace_View in a new browser tab
4. WHEN the user clicks "Open PDF" and selects a PDF file from the file picker dialog, THE Extension SHALL open the Workspace_View in a new browser tab and load the selected file into it
5. WHEN the user clicks "Merge PDFs", THE Extension SHALL open the Workspace_View in a new browser tab with the merge operation panel active and a file picker dialog for selecting multiple PDF files
6. THE Popup_UI SHALL display the extension version number and a link to the settings page defined in the Extension's settings interface
7. IF the user cancels the file picker dialog opened from the Popup_UI, THEN THE Popup_UI SHALL remain open with no changes to its state

### Requirement 10: Cross-Browser Compatibility

**User Story:** As a developer, I want the extension to work across Chrome, Firefox, Edge, and Safari, so that all users can access the PDF toolkit regardless of their browser choice.

#### Acceptance Criteria

1. THE Extension SHALL function on Chrome version 110 and above using Manifest_V3, supporting all PDF operations defined in Requirements 1-9 and 17-27
2. THE Extension SHALL function on Firefox version 109 and above using the WebExtensions_API with Firefox-specific manifest adjustments, supporting all PDF operations defined in Requirements 1-9 and 17-27
3. THE Extension SHALL function on Edge version 110 and above using Manifest_V3 (Chromium-based), supporting all PDF operations defined in Requirements 1-9 and 17-27
4. THE Extension SHALL function on Safari version 16.4 and above using the Safari Web Extensions format, supporting all PDF operations defined in Requirements 1-9 and 17-27
5. THE Extension SHALL produce identical PDF output files (byte-level content equivalence excluding metadata timestamps) for the same input and operation regardless of which supported browser is used
6. WHEN a browser-specific API is unavailable, THE Extension SHALL disable the affected feature's UI control, display a persistent inline notification identifying the unavailable feature and the reason, and prevent the user from initiating that operation
7. IF the user launches the Extension on a supported browser version that lacks a required API for a specific feature, THEN THE Extension SHALL indicate which features are unavailable on the settings page with the minimum browser version required to enable them

### Requirement 11: Local Processing Privacy Guarantee

**User Story:** As a user, I want assurance that my PDF content never leaves my machine, so that I can trust the extension with sensitive documents.

#### Acceptance Criteria

1. THE Extension SHALL perform all PDF parsing, rendering, and manipulation operations exclusively within the browser's local execution environment using the PDF_Engine and Web Workers
2. THE Extension SHALL NOT make any network requests containing PDF content, page pixel data, document metadata (including filename, page count, author, title, or dimensions), or any derivative of user-loaded documents
3. THE Extension SHALL declare minimal permissions in the browser manifest, requesting only activeTab, file access, storage, and downloads permissions and no others
4. THE Extension SHALL enforce a Content Security Policy that blocks all outbound connections from extension pages by setting connect-src to 'self' only, except for the browser-native extension update mechanism
5. IF the extension detects a CSP violation attempt, THEN THE Extension SHALL log the violation type and blocked URI to the browser console and block the request without transmitting any data externally
6. THE Extension SHALL not include any analytics, tracking, or telemetry code that transmits information about user documents, user actions within the extension, or extension usage patterns to external servers
7. THE Extension SHALL NOT persist any PDF content or document data to Local_Storage; only user preferences and operation settings as defined in Requirement 19 may be stored
8. WHEN a user closes the Workspace_View or unloads a PDF, THE Extension SHALL purge all PDF content from memory and ensure no document data remains in any browser storage mechanism

### Requirement 12: Landing Page and Download Distribution

**User Story:** As a user, I want a landing page where I can download the correct extension for my browser, so that I can install it easily.

#### Acceptance Criteria

1. WHEN a user visits the landing page, THE Landing_Page_Server SHALL detect the user's browser type and operating system via the User-Agent header
2. WHEN browser detection succeeds, THE Landing_Page_Server SHALL display a primary download button labeled with the detected browser name and pre-selecting the corresponding Extension_Package type
3. THE Landing_Page_Server SHALL display alternative download options for all other supported browsers (Chrome, Firefox, Edge, and Safari)
4. WHEN the user clicks a download button, THE Distribution_API SHALL serve the correct Extension_Package for the selected browser from the CDN
5. THE Landing_Page_Server SHALL display feature descriptions, privacy guarantees, and installation instructions
6. THE Landing_Page_Server SHALL be responsive and render without horizontal scrolling, content overflow, or inaccessible interactive elements at viewport widths from 320px to 2560px
7. WHEN a user visits from an unsupported browser, THE Landing_Page_Server SHALL display a message listing supported browsers (Chrome, Firefox, Edge, and Safari) and provide manual download links for each
8. IF the Landing_Page_Server cannot determine the user's browser type from the User-Agent header, THEN THE Landing_Page_Server SHALL display all supported browser download options equally without a pre-selected primary button

### Requirement 13: Azure Container Deployment

**User Story:** As a developer, I want the landing page deployed as a container on Azure, so that it is scalable, maintainable, and cost-effective.

#### Acceptance Criteria

1. THE Landing_Page_Server SHALL run as a Docker container deployed to Azure Container Apps
2. WHEN a health check request is received at the /health endpoint, THE Landing_Page_Server SHALL respond with a 200 status code within 5 seconds
3. THE Landing_Page_Server SHALL auto-scale from 0 to a maximum of 10 container instances, scaling out when concurrent HTTP requests exceed 50 per instance
4. THE Landing_Page_Server SHALL serve static assets (CSS, JS, images) via Azure CDN with cache headers set to a minimum TTL of 24 hours
5. THE Landing_Page_Server SHALL use HTTPS exclusively with TLS 1.2 or higher and redirect any HTTP requests to HTTPS
6. WHEN the container instance fails a health check three consecutive times at an interval of 30 seconds, THE Azure Container Apps platform SHALL restart the instance automatically
7. WHEN the Landing_Page_Server is scaled to zero instances and a new request arrives, THE Azure Container Apps platform SHALL start a container instance and serve the response within 10 seconds

### Requirement 14: Extension Package Storage and CDN

**User Story:** As a developer, I want extension packages stored in Azure Blob Storage and served via CDN, so that downloads are fast and reliable globally.

#### Acceptance Criteria

1. WHEN a build completes successfully, THE CI_CD_Pipeline SHALL upload the built Extension_Packages for all supported browsers (Chrome, Firefox, Edge, Safari) to Azure Blob Storage, and SHALL verify upload integrity by comparing checksums before marking the upload as complete
2. THE CDN SHALL serve Extension_Packages from edge locations closest to the requesting user
3. WHEN a user requests an extension download, THE Distribution_API SHALL construct a download URL pointing to the versioned, browser-specific path in Azure Blob Storage (e.g., /packages/v1.2.0/chrome/extension.crx)
4. THE CDN SHALL cache Extension_Packages with a TTL of 7 days, and WHEN a new release is uploaded, THE CI_CD_Pipeline SHALL invalidate the CDN cache for the updated paths with propagation completing within 10 minutes
5. THE Azure Blob Storage SHALL retain the three most recent major versions of each Extension_Package per supported browser for rollback capability
6. IF an upload to Azure Blob Storage fails or integrity verification fails, THEN THE CI_CD_Pipeline SHALL retry the upload up to 3 times and, if all retries fail, SHALL halt the pipeline and notify the development team without publishing partial artifacts

### Requirement 15: CI/CD Pipeline for Multi-Browser Builds

**User Story:** As a developer, I want an automated CI/CD pipeline that builds and publishes extension packages for all browsers, so that releases are consistent and reliable.

#### Acceptance Criteria

1. WHEN code is pushed to the main branch, THE CI_CD_Pipeline SHALL trigger a build for all supported browser targets (Chrome, Firefox, Edge, Safari)
2. WHEN a build is triggered, THE CI_CD_Pipeline SHALL run linting, unit tests, and integration tests, and SHALL proceed to produce build artifacts only if all tests pass with zero failures
3. THE CI_CD_Pipeline SHALL generate versioned Extension_Packages with semantic versioning (MAJOR.MINOR.PATCH) embedded in the filename and manifest, sourced from the version field in the project's package manifest
4. THE CI_CD_Pipeline SHALL sign Chrome and Edge extensions with the browser-specific private signing key stored in the pipeline's secret vault
5. THE CI_CD_Pipeline SHALL package the Firefox extension as an .xpi file compliant with Mozilla Add-ons requirements
6. THE CI_CD_Pipeline SHALL generate the Safari extension using Xcode command-line tools for macOS and iOS builds
7. IF any build step fails, THEN THE CI_CD_Pipeline SHALL halt the pipeline, send a notification to the development team's configured notification channel (e.g., email distribution list or chat webhook), and produce no partial artifacts
8. THE CI_CD_Pipeline SHALL upload successful build artifacts to Azure Blob Storage and invalidate the CDN cache for updated paths
9. IF the pipeline does not complete all build steps within 30 minutes, THEN THE CI_CD_Pipeline SHALL terminate the build, report a timeout failure, and notify the development team

### Requirement 16: Extension Versioning and Auto-Update

**User Story:** As a user, I want the extension to update automatically, so that I always have the latest features and security fixes.

#### Acceptance Criteria

1. THE Extension SHALL check for updates using the browser's native extension update mechanism at the interval determined by each browser's built-in update scheduler
2. WHERE the Extension is built for Chrome or Edge, THE Extension SHALL specify the update_url in the manifest pointing to the Distribution_API
3. WHERE the Extension is built for Firefox, THE Extension SHALL use the Mozilla Add-ons update mechanism after listing on addons.mozilla.org
4. WHERE the Extension is built for Safari, THE Extension SHALL use the Mac App Store or Apple's App Extensions update mechanism for distribution and auto-updates
5. WHEN an update is available, THE Extension SHALL apply the update following the browser's native update flow without requiring user intervention
6. THE Distribution_API SHALL serve an update manifest in Chrome/Edge XML update format and Firefox JSON update format, each containing the latest version number and download URL for the respective browser
7. IF the Distribution_API is unreachable during an update check, THEN THE Extension SHALL continue operating with the currently installed version and retry on the next browser-scheduled update cycle without displaying an error to the user

### Requirement 17: PDF Engine Implementation

**User Story:** As a developer, I want a performant client-side PDF engine, so that all operations execute quickly and reliably in the browser.

#### Acceptance Criteria

1. THE PDF_Engine SHALL use a WebAssembly-compiled PDF library (such as pdf-lib, PDFium compiled to WASM, or equivalent) for PDF manipulation operations including merge, split, extract, delete, reorder, rotate, watermark, compress, and encrypt/decrypt
2. THE PDF_Engine SHALL render page thumbnails at a maximum resolution of 300px on the longest edge using PDF.js or an equivalent JavaScript-based PDF renderer
3. THE PDF_Engine SHALL process a 100-page PDF merge operation within 5 seconds on a reference machine with 8GB RAM and a quad-core processor clocked at 2.0GHz or above, where each source PDF contains a mix of text and embedded images at standard letter page size
4. THE PDF_Engine SHALL parse and perform all supported operations on PDF files conforming to PDF specification versions 1.0 through 2.0
5. WHEN the user loads a PDF file that requires a password to open, THE PDF_Engine SHALL prompt the user for the document password before attempting to parse the file contents
6. IF the PDF_Engine encounters a corrupted or malformed PDF (a file that fails PDF header validation or contains unrecoverable structural errors), THEN THE PDF_Engine SHALL display an error message indicating the file cannot be processed and reject the file without crashing
7. WHEN page thumbnails are requested, THE PDF_Engine SHALL render the first 20 visible thumbnails within 2 seconds for a document up to 100 pages on the reference machine defined in criterion 3
8. THE PDF_Engine SHALL process operations sequentially, queuing any additional operation requests until the current operation completes

### Requirement 18: Extension Security and Content Security Policy

**User Story:** As a developer, I want strict security controls in the extension, so that user data is protected and the extension cannot be exploited.

#### Acceptance Criteria

1. THE Extension SHALL declare a Content Security Policy in the manifest that restricts script-src to 'self' and 'wasm-unsafe-eval' only
2. THE Extension SHALL NOT use eval(), Function(), setTimeout(string), setInterval(string), or any other dynamic code evaluation outside of the WebAssembly runtime
3. THE Extension SHALL NOT request permissions beyond: activeTab, storage, downloads, and file access (where applicable per browser)
4. THE Extension SHALL sanitize all user-provided filenames by removing characters outside the set [a-zA-Z0-9 _\-\.] and truncating to a maximum of 200 characters, and SHALL validate page range inputs by accepting only digits, commas, hyphens, and spaces with a maximum input length of 500 characters
5. THE Extension SHALL isolate PDF processing in a Web Worker to prevent blocking the main UI thread and to restrict processing code from accessing the DOM or browser extension APIs directly
6. THE Extension SHALL NOT declare content scripts in the manifest and SHALL NOT programmatically inject scripts into web pages
7. IF the Extension rejects a user input due to sanitization rules, THEN THE Extension SHALL display an error message indicating which characters or length constraints were violated and preserve the user's original input for correction

### Requirement 19: User Preferences and Settings

**User Story:** As a user, I want to configure extension settings, so that I can customize the behavior to my workflow.

#### Acceptance Criteria

1. THE Extension SHALL provide a settings page accessible from both the Popup_UI and the Workspace_View via a clearly labeled settings button or link
2. THE Extension SHALL allow the user to configure default output filename patterns for generated PDFs using supported tokens (original filename, date, operation type, and page range), with a maximum pattern length of 255 characters
3. THE Extension SHALL allow the user to choose between grid and list view layouts in the Workspace_View, with grid view as the default
4. THE Extension SHALL persist all user preferences in Local_Storage across browser sessions, using no more than 5MB of storage
5. WHEN the user modifies a setting, THE Extension SHALL apply the change to all open Extension views within 1 second without requiring a restart
6. IF Local_Storage is unavailable or full, THEN THE Extension SHALL display an error message indicating that preferences cannot be saved and continue operating with the current in-memory settings
7. THE Extension SHALL provide a "Reset to Defaults" option on the settings page that restores all preferences to their initial values upon user confirmation
8. IF the user enters a filename pattern containing characters not permitted by the operating system (such as /, \, :, *, ?, ", <, >, |), THEN THE Extension SHALL display a validation error identifying the invalid characters

### Requirement 20: Undo and Operation History

**User Story:** As a user, I want to undo operations and see my operation history, so that I can recover from mistakes.

#### Acceptance Criteria

1. WHEN the user performs a destructive operation (delete, split, reorder, rotate, or watermark), THE Extension SHALL retain the previous document state in memory for undo before applying the operation
2. WHEN the user triggers the undo action (Ctrl+Z / Cmd+Z or via the UI button), THE Extension SHALL revert the document to the state before the last operation and update the Workspace_View thumbnails and page numbers to reflect the restored state
3. THE Extension SHALL support undoing up to 10 consecutive operations within a single Workspace_View tab session, discarding the oldest stored state when an 11th operation is performed
4. THE Extension SHALL display an operation history panel in the Workspace_View listing all operations performed in the current session, where each entry shows the operation type, affected page numbers, and timestamp
5. IF the user closes the Workspace_View tab, THEN THE Extension SHALL discard all undo history and stored document states to free memory
6. IF the user performs a new destructive operation after undoing one or more operations, THEN THE Extension SHALL discard all redo-forward states and treat the new operation as the latest entry in the undo stack
7. IF the user triggers the undo action when no undoable operations remain in the history, THEN THE Extension SHALL keep the document unchanged and disable the undo control until a new operation is performed

### Requirement 21: Accessibility Compliance

**User Story:** As a user with disabilities, I want the extension to be accessible, so that I can use all features with assistive technology.

#### Acceptance Criteria

1. THE Extension SHALL ensure all interactive elements in the Popup_UI and Workspace_View are keyboard-navigable using Tab and Arrow keys with a visible focus indicator that meets a minimum contrast ratio of 3:1 against adjacent colors
2. THE Extension SHALL provide ARIA labels for all buttons, thumbnails, and interactive components
3. THE Extension SHALL maintain a minimum color contrast ratio of 4.5:1 for text and 3:1 for UI components as per WCAG 2.1 Level AA
4. THE Extension SHALL announce errors and failed operations to screen readers using ARIA live regions with assertive politeness, and announce successful operation results using ARIA live regions with polite politeness
5. THE Extension SHALL support browser zoom levels from 100% to 200% without loss of functionality or layout overflow
6. WHEN a modal overlay, confirmation dialog, or error message is displayed, THE Extension SHALL move keyboard focus to the newly displayed element, and WHEN the element is dismissed, THE Extension SHALL return focus to the element that triggered it
7. THE Extension SHALL provide a keyboard-accessible alternative for all drag-and-drop operations (page reordering, file reordering for merge) using move-up and move-down controls or equivalent keyboard commands

### Requirement 22: Error Handling and Recovery

**User Story:** As a user, I want clear error messages and graceful recovery, so that I am never stuck or confused when something goes wrong.

#### Acceptance Criteria

1. IF a PDF operation fails due to memory exhaustion, THEN THE Extension SHALL display an error message suggesting the user try a smaller file or fewer pages
2. IF the PDF_Engine encounters an unexpected error during processing, THEN THE Extension SHALL catch the error, display a non-technical message describing the failed operation and a suggested corrective action, and return the Workspace_View to its pre-operation state with the loaded document and page selections intact
3. WHEN an error occurs, THE Extension SHALL log the error type, operation name, and timestamp (without PDF content or user data) to the browser console for debugging purposes
4. THE Extension SHALL NOT display raw JavaScript error messages, stack traces, or technical details to the user
5. IF a file download fails, THEN THE Extension SHALL offer a retry option allowing up to 3 retry attempts and retain the processed output in memory until the user successfully downloads or closes the Workspace_View tab
6. WHEN the Extension displays an error message, THE Extension SHALL present the message in a dismissible notification that the user can close to continue using the Workspace_View without refreshing the page

### Requirement 23: Performance and Resource Management

**User Story:** As a user, I want the extension to perform well and not consume excessive resources, so that my browsing experience remains smooth.

#### Acceptance Criteria

1. WHILE no PDF document is open in the Workspace_View, THE Extension SHALL limit its total memory footprint to 50MB or less
2. WHILE processing a PDF, THE Extension SHALL not accumulate memory beyond the size of the input document plus 100MB of working memory, releasing buffers from completed processing stages before beginning the next stage
3. THE Extension SHALL process PDF operations in a Web Worker such that the browser's main thread does not experience any individual task longer than 50ms during PDF processing
4. THE PDF_Engine SHALL render Page_Thumbnails within the visible viewport and within one viewport height above and below the visible area first, deferring all other off-screen thumbnails until they are scrolled to within that range
5. WHEN the user closes the Workspace_View, THE Extension SHALL release all PDF-related memory within 5 seconds
6. IF a PDF operation does not complete within 30 seconds, THEN THE Extension SHALL display a notification offering the user the option to cancel the operation and return the Workspace_View to a usable state

### Requirement 24: PDF Watermarking

**User Story:** As a user, I want to add watermarks to my PDF pages, so that I can mark documents as drafts, confidential, or add custom branding.

#### Acceptance Criteria

1. WHEN the user selects the watermark operation, THE Extension SHALL display a watermark configuration panel with text input (maximum 200 characters), font size (8pt to 144pt), color picker, opacity (0% to 100% in 1% increments), rotation angle (0° to 359°), and position options (center, top-left, top-right, bottom-left, bottom-right, or custom x/y as percentage of page dimensions)
2. THE PDF_Engine SHALL support text-based watermarks rendered as a semi-transparent overlay on top of existing page content at the user-specified position on selected pages
3. THE PDF_Engine SHALL support image-based watermarks by allowing the user to upload a PNG or JPEG image (maximum file size 5MB) and SHALL scale the image to the user-specified width (1% to 100% of page width) while maintaining aspect ratio
4. THE Extension SHALL allow the user to apply the watermark to all pages, selected pages, or a specified page range
5. THE Extension SHALL display a preview of the watermark on the currently visible Page_Thumbnail within 500ms of any parameter change, before the user confirms the operation
6. THE PDF_Engine SHALL render text watermarks using standard fonts (Helvetica, Times, Courier) without requiring external font file downloads
7. WHEN the user confirms the watermark operation, THE PDF_Engine SHALL embed the watermark into the PDF pages and offer the result for download via the browser download dialog
8. IF the user attempts to confirm a text watermark with empty text, an opacity of 0%, or an image watermark with no image selected, THEN THE Extension SHALL display an error message indicating the specific invalid configuration and prevent the operation
9. IF the user uploads an image file that is not a valid PNG or JPEG or exceeds 5MB, THEN THE Extension SHALL display an error message indicating the file is invalid and allow the user to select a different image

### Requirement 25: PDF Compression

**User Story:** As a user, I want to compress PDF files to reduce their size, so that I can save storage space and share files more easily.

#### Acceptance Criteria

1. WHEN the user selects the compress operation, THE Extension SHALL display compression level options: Low (images downsampled to 150 DPI, targeting minimal quality loss), Medium (images downsampled to 96 DPI, balanced quality and size), and High (images downsampled to 72 DPI, maximum size reduction)
2. THE PDF_Engine SHALL compress PDF files by downsampling embedded images to the target DPI for the selected level, removing duplicate resources, and optimizing internal streams
3. WHEN compression is complete, THE Extension SHALL display the original file size, compressed file size, and percentage reduction
4. THE PDF_Engine SHALL preserve all text content, vector graphics, and page structure during compression (only raster image quality may be reduced)
5. THE PDF_Engine SHALL achieve a minimum of 10% size reduction on Low, 20% on Medium, and 30% on High compression for PDFs containing embedded images larger than 1MB
6. WHEN the user confirms the compression, THE Extension SHALL offer the compressed PDF for download via the browser download dialog
7. IF the PDF contains no compressible content and the achievable size reduction is less than 5%, THEN THE Extension SHALL inform the user that minimal size reduction is achievable and display the estimated reduction percentage
8. THE PDF_Engine SHALL complete compression of a PDF file up to 50MB within 15 seconds
9. IF compression fails due to a processing error or memory exhaustion, THEN THE Extension SHALL display an error message indicating compression could not be completed, preserve the original file in the Workspace_View, and return to a usable state

### Requirement 26: PDF Password Protection (Add Password)

**User Story:** As a user, I want to add password protection to my PDF files, so that I can restrict access to sensitive documents.

#### Acceptance Criteria

1. WHEN the user selects the add-password operation, THE Extension SHALL display a password configuration form with fields for an owner password, an optional user password, and a confirmation field for each entered password
2. WHEN the user confirms the password configuration, THE PDF_Engine SHALL encrypt the PDF using AES-256 encryption
3. THE Extension SHALL allow the user to configure permission flags: allow/disallow printing, copying text, editing, and annotating
4. WHEN the user sets only an owner password, THE PDF_Engine SHALL allow anyone to open the document but restrict the configured permissions
5. WHEN the user sets both an owner password and a user password, THE PDF_Engine SHALL require the user password to open the document
6. THE Extension SHALL validate that each password is between 6 and 128 characters in length before applying encryption
7. IF a password fails validation or the confirmation field does not match the original entry, THEN THE Extension SHALL display an inline error message indicating the specific validation failure and prevent the encryption operation
8. WHEN password protection is applied successfully, THE Extension SHALL offer the encrypted PDF for download
9. IF the user attempts to add password protection to a PDF that is already encrypted, THEN THE Extension SHALL display an error message indicating the document is already protected and suggest removing the existing password first

### Requirement 27: PDF Password Removal (Remove Password)

**User Story:** As a user, I want to remove password protection from my PDF files, so that I can access and edit documents I own without restrictions.

#### Acceptance Criteria

1. WHEN the user loads a password-protected PDF, THE Extension SHALL prompt the user to enter the document password
2. WHEN the user provides the correct password and selects the remove-password operation, THE PDF_Engine SHALL decrypt the document and produce an unprotected PDF preserving all page content, embedded fonts, annotations, and formatting from the original document
3. THE PDF_Engine SHALL remove all permission restrictions (printing, copying, editing, annotating) from the decrypted document
4. WHEN password removal is complete, THE Extension SHALL offer the unprotected PDF for download
5. IF the user provides an incorrect password, THEN THE Extension SHALL display an error indicating the password is incorrect and allow the user to retry up to 5 consecutive attempts
6. THE Extension SHALL NOT attempt to bypass, crack, or brute-force PDF password protection; decryption requires the correct password from the user
7. WHEN the user loads a PDF that has only owner-password restrictions (no open password required), THE Extension SHALL prompt the user to enter the owner password before performing the remove-password operation
8. IF the PDF_Engine fails to decrypt the document due to an unsupported encryption method or corrupted encryption data, THEN THE Extension SHALL display an error message indicating the document cannot be decrypted and the reason for the failure
