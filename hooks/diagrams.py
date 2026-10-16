"""Keep wide Mermaid diagrams readable inside the article's text column."""

import re


MERMAID_BLOCK = re.compile(r'<pre class="mermaid"><code>(.*?)</code></pre>', re.DOTALL)
HORIZONTAL_FLOW = re.compile(r'^\s*(?:flowchart|graph)\s+(?:LR|RL)\b', re.MULTILINE)


def on_page_content(html, **kwargs):
    def wrap(match):
        horizontal = bool(HORIZONTAL_FLOW.search(match.group(1)))
        modifier = " kb-diagram--horizontal" if horizontal else ""
        label = "流程图，可拖动、滑动或用方向键横向滚动" if horizontal else "流程图"
        return (
            f'<div class="kb-diagram{modifier}" role="region" '
            f'aria-label="{label}" tabindex="0">{match.group(0)}</div>'
        )

    return MERMAID_BLOCK.sub(wrap, html)
