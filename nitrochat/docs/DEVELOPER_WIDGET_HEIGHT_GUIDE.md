# Developer Guide: Customizing Widget Heights in NitroChat

This guide explains how to control and adjust the iframe height of your MCP widgets dynamically or statically inside NitroChat.

---

## Default Behavior
By default, all MCP widgets in NitroChat render inside an iframe styled with a fixed responsive height clamp:
```css
height: clamp(440px, 72vh, 860px);
min-height: 440px;
```
For compact components (like forms, feedback widgets, or simple confirmation alerts), this default height leaves a large amount of empty space.

---

## How to Customize Widget Heights
You can override the default container size from your widget's code by sending a `nitro:set_height` event to the parent window. To ensure height changes are isolated, you must include the unique `widgetId` parameter provided by NitroChat in `window.openai.widgetId`.

### Supported Height Input Types
The `height` parameter accepts both numbers and strings:
1. **Numbers**: Passing a raw number (e.g. `220` or `"220"`) will apply safety boundaries and automatically append `px`.
2. **Strings with Units**: Passing a string containing CSS units (e.g., `"50vh"`, `"95%"`, `"30rem"`, or `"calc(100% - 24px)"`) will pass the value directly to the parent CSS layout.

---

### Method 1: Set a Static Height on Mount
Use this method if your widget has a known, fixed layout height (e.g. `220px` or `30rem`).

```typescript
import { useEffect } from 'react';

export default function MyWidget() {
    useEffect(() => {
        // Read the unique ID injected by the parent frame
        const widgetId = (window as any).openai?.widgetId;
        
        // Notify the parent frame to resize using standard pixels
        window.parent.postMessage({
            type: 'nitro:set_height',
            widgetId: widgetId,
            height: 220 // Evaluates to "220px"
        }, '*');
    }, []);

    return (
        <div id="widget-root" style={{ height: '220px', padding: '16px' }}>
            {/* Widget content */}
        </div>
    );
}
```

#### Example using custom units (e.g., `"30rem"`):
```typescript
window.parent.postMessage({
    type: 'nitro:set_height',
    widgetId: widgetId,
    height: "30rem" // Passed directly as a CSS string value
}, '*');
```

---

### Method 2: Auto-Adjust Height Dynamically (Recommended)
Use this method if your widget height changes based on user interactions, state modifications, or expanding components (like dropdown menus).

```typescript
import { useEffect } from 'react';

export default function DynamicWidget() {
    useEffect(() => {
        const rootEl = document.getElementById('widget-root');
        if (!rootEl) return;

        // Auto-observe scroll height adjustments
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.target.scrollHeight;
                const widgetId = (window as any).openai?.widgetId;
                
                window.parent.postMessage({
                    type: 'nitro:set_height',
                    widgetId: widgetId,
                    height: height + 24 // Add safety padding to prevent scrollbars
                }, '*');
            }
        });

        resizeObserver.observe(rootEl);
        return () => resizeObserver.disconnect();
    }, []);

    return (
        <div id="widget-root" style={{ width: '100%' }}>
            {/* Widget content */}
        </div>
    );
}
```

> ⚠️ **Layout note when using dynamic height:** Avoid styling your elements using absolute positioning (`position: absolute`) if you expect them to expand the height of your widget. Elements outside the normal document flow will not grow the parent container's `scrollHeight`. Use relative (`position: relative`) or flow positioning instead.

---

## Parent Window Constraints
For layout safety, NitroChat clamps any customized **numeric** height inputs to:
* **Minimum**: `100px`
* **Maximum**: `1200px`

*Note: String units like `%` or `vh` are passed through directly without clamping.*

If your widget does not dispatch a `nitro:set_height` event, it defaults gracefully back to the standard `clamp(440px, 72vh, 860px)` configuration.
