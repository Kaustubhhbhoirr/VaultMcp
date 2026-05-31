"""
md_generator.py — Structured Markdown Vault Entry Generator

Takes the final structured data (from ai_processor + web_searcher) and generates
a clean, categorized Markdown entry ready to append to the user's Vault.md file.

Output format:
  ## [CATEGORY: {category}]
  ### {title}
  - Summary: {summary}
  - Official link: {official_link}
  - Source: {source_url}
  - Saved on: {saved_on}

Also supports:
  - Generating standalone single-entry .md files
  - Generating the full Vault.md master file from a list of entries
  - Merging a new entry into an existing Vault.md (append under correct category)
"""

from datetime import datetime
from dataclasses import dataclass, field
from typing import List, Optional


# ─── Configuration ───────────────────────────────────────────────────────────

# Valid categories in display order
CATEGORIES_ORDER = [
    "AI Tools",
    "Dev Tools",
    "Prompts",
    "Design",
    "Resources",
    "Other"
]

VAULT_HEADER = "# VaultMCP Vault\n\n> Save what you scroll. Use what you saved.\n"


# ─── Entry Data Container ───────────────────────────────────────────────────

@dataclass
class VaultEntry:
    """All data needed to generate a Markdown vault entry."""
    title: str
    category: str
    summary: str
    official_link: str = ""
    source_url: str = ""
    original_file_link: str = ""
    md_file_link: str = ""
    tools_mentioned: List[str] = field(default_factory=list)
    links_mentioned: List[str] = field(default_factory=list)
    saved_on: str = ""                  # Will be auto-set if empty

    def __post_init__(self):
        if not self.saved_on:
            self.saved_on = format_retro_date(datetime.utcnow())

        # Normalize category
        if self.category not in CATEGORIES_ORDER:
            self.category = "Other"


# ─── Date Formatting ────────────────────────────────────────────────────────

def format_retro_date(dt: Optional[datetime] = None) -> str:
    """
    Format a datetime in the VaultMCP retro style: DD.MMM.YYYY
    Example: 12.OCT.2023

    Args:
        dt: Datetime to format. Uses UTC now if None.

    Returns:
        Formatted date string.
    """
    if dt is None:
        dt = datetime.utcnow()

    return dt.strftime("%d.%b.%Y").upper()


# ─── Single Entry Generator ─────────────────────────────────────────────────

def generate_entry_md(entry: VaultEntry) -> str:
    """
    Generate a Markdown block for a single vault entry.

    Args:
        entry: VaultEntry with all structured data.

    Returns:
        Formatted Markdown string for this entry.

    Example output:
        ## [CATEGORY: AI Tools]
        ### Cursor AI
        - Summary: AI-powered code editor with agentic workflows for rapid prototyping.
        - Official link: https://cursor.com
        - Source: https://instagram.com/reel/abc123
        - Saved on: 12.OCT.2023
    """
    lines = []

    # Category header
    lines.append(f"## [CATEGORY: {entry.category}]")

    # Title
    lines.append(f"### {entry.title}")

    # Summary
    lines.append(f"- Summary: {entry.summary}")

    # Official link
    if entry.official_link:
        lines.append(f"- Official link: {entry.official_link}")
    else:
        lines.append("- Official link: N/A")

    if entry.md_file_link:
        lines.append(f"- MD File: {entry.md_file_link}")

    # Source URL (where the user found this content)
    if entry.source_url:
        lines.append(f"- Source: {entry.source_url}")

    if entry.original_file_link:
        lines.append(f"- Original File: {entry.original_file_link}")

    # Tools mentioned (if any)
    if entry.tools_mentioned:
        tools_str = ", ".join(entry.tools_mentioned)
        lines.append(f"- Tools mentioned: {tools_str}")

    # Saved date
    lines.append(f"- Saved on: {entry.saved_on}")

    # Trailing newline for clean separation
    lines.append("")

    return "\n".join(lines)


# ─── Standalone File Generator ───────────────────────────────────────────────

def generate_standalone_md(entry: VaultEntry) -> str:
    """
    Generate a complete standalone .md file for a single entry.
    Includes a small header before the entry.

    Args:
        entry: VaultEntry with all structured data.

    Returns:
        Full Markdown file content.
    """
    lines = [
        f"# {entry.title}",
        "",
        f"> Saved by VaultMCP on {entry.saved_on}",
        "",
        "---",
        "",
        generate_entry_md(entry),
    ]

    return "\n".join(lines)


# ─── Full Vault Generator ───────────────────────────────────────────────────

def generate_vault_md(entries: List[VaultEntry]) -> str:
    """
    Generate the complete Vault.md master file from a list of entries.
    Entries are grouped by category in the standard order.

    Args:
        entries: List of VaultEntry objects.

    Returns:
        Full Vault.md content as a string.
    """
    lines = [VAULT_HEADER, "---", ""]

    # Group entries by category
    grouped: dict[str, List[VaultEntry]] = {cat: [] for cat in CATEGORIES_ORDER}

    for entry in entries:
        category = entry.category if entry.category in CATEGORIES_ORDER else "Other"
        grouped[category].append(entry)

    # Render each category that has entries
    for category in CATEGORIES_ORDER:
        category_entries = grouped[category]
        if not category_entries:
            continue

        lines.append(f"## [CATEGORY: {category}]")
        lines.append("")

        for entry in category_entries:
            lines.append(f"### {entry.title}")
            lines.append(f"- Summary: {entry.summary}")

            if entry.official_link:
                lines.append(f"- Official link: {entry.official_link}")
            else:
                lines.append("- Official link: N/A")

            if entry.md_file_link:
                lines.append(f"- MD File: {entry.md_file_link}")

            if entry.source_url:
                lines.append(f"- Source: {entry.source_url}")

            if entry.original_file_link:
                lines.append(f"- Original File: {entry.original_file_link}")

            if entry.tools_mentioned:
                tools_str = ", ".join(entry.tools_mentioned)
                lines.append(f"- Tools mentioned: {tools_str}")

            lines.append(f"- Saved on: {entry.saved_on}")
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ─── Merge Into Existing Vault ───────────────────────────────────────────────

def merge_entry_into_vault(existing_vault_md: str, entry: VaultEntry) -> str:
    """
    Merge a new entry into an existing Vault.md string.

    If the category section already exists, the entry is appended under it.
    If the category section doesn't exist, it's created at the correct position.

    Args:
        existing_vault_md: Current contents of Vault.md.
        entry:             New entry to merge in.

    Returns:
        Updated Vault.md content with the new entry merged in.
    """
    entry_block = _render_entry_lines(entry)
    category_header = f"## [CATEGORY: {entry.category}]"

    # Check if the category section already exists
    if category_header in existing_vault_md:
        # Find the end of this category section (next ## or end of file)
        idx = existing_vault_md.index(category_header)
        after_header = existing_vault_md[idx + len(category_header):]

        # Find the next category header or horizontal rule that separates categories
        next_section = _find_next_section(after_header)

        if next_section is not None:
            insert_pos = idx + len(category_header) + next_section
            return (
                existing_vault_md[:insert_pos].rstrip("\n")
                + "\n\n"
                + entry_block
                + "\n"
                + existing_vault_md[insert_pos:]
            )
        else:
            # Append at end
            return existing_vault_md.rstrip("\n") + "\n\n" + entry_block + "\n"

    else:
        # Category doesn't exist — find the right position and insert
        insert_position = _find_category_insert_position(existing_vault_md, entry.category)

        new_section = f"\n{category_header}\n\n{entry_block}\n---\n"

        if insert_position is not None:
            return (
                existing_vault_md[:insert_position]
                + new_section
                + existing_vault_md[insert_position:]
            )
        else:
            return existing_vault_md.rstrip("\n") + "\n" + new_section


def _render_entry_lines(entry: VaultEntry) -> str:
    """Render a single entry without the category header."""
    lines = []
    lines.append(f"### {entry.title}")
    lines.append(f"- Summary: {entry.summary}")

    if entry.official_link:
        lines.append(f"- Official link: {entry.official_link}")
    else:
        lines.append("- Official link: N/A")

    if entry.md_file_link:
        lines.append(f"- MD File: {entry.md_file_link}")

    if entry.source_url:
        lines.append(f"- Source: {entry.source_url}")

    if entry.original_file_link:
        lines.append(f"- Original File: {entry.original_file_link}")

    if entry.tools_mentioned:
        tools_str = ", ".join(entry.tools_mentioned)
        lines.append(f"- Tools mentioned: {tools_str}")

    lines.append(f"- Saved on: {entry.saved_on}")

    return "\n".join(lines)


def _find_next_section(text: str) -> Optional[int]:
    """Find the position of the next ## header or --- separator in text."""
    import re
    match = re.search(r"\n(?=## \[CATEGORY:|---)", text)
    if match:
        return match.start()
    return None


def _find_category_insert_position(vault_md: str, category: str) -> Optional[int]:
    """
    Find the correct position to insert a new category section
    based on CATEGORIES_ORDER.
    """
    target_idx = CATEGORIES_ORDER.index(category) if category in CATEGORIES_ORDER else len(CATEGORIES_ORDER)

    # Look for the first category that should come AFTER this one
    for later_cat in CATEGORIES_ORDER[target_idx + 1:]:
        header = f"## [CATEGORY: {later_cat}]"
        if header in vault_md:
            pos = vault_md.index(header)
            # Back up past any preceding whitespace or ---
            while pos > 0 and vault_md[pos - 1] in ("\n", "-", " "):
                pos -= 1
            return max(pos, 0)

    return None


# ─── Convenience: Build from ai_processor + web_searcher results ────────────

def build_entry(
    processed: dict,
    source_url: str = "",
    official_link: str = "",
    original_file_link: str = "",
    md_file_link: str = "",
) -> VaultEntry:
    """
    Build a VaultEntry from ai_processor output + web_searcher result.

    Args:
        processed:     Dict from ai_processor.result_to_dict() with title, category, summary, etc.
        source_url:    Original URL the user shared (Instagram reel, etc.)
        official_link: Official link found by web_searcher.

    Returns:
        VaultEntry ready for Markdown generation.
    """
    VALID_CATEGORIES = ["AI Tools", "Dev Tools", "Prompts", "Design", "Resources", "Other"]
    cat = processed.get("category", "Other")
    if cat not in VALID_CATEGORIES:
        cat = "Other"

    return VaultEntry(
        title=processed.get("title", "Untitled"),
        category=cat,
        summary=processed.get("summary", ""),
        official_link=official_link,
        source_url=source_url,
        original_file_link=original_file_link,
        md_file_link=md_file_link,
        tools_mentioned=processed.get("tools_mentioned", []),
        links_mentioned=processed.get("links_mentioned", []),
    )


# ─── CLI Test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("[VaultMCP] md_generator.py — Test Output\n")

    # Create sample entries
    sample_entries = [
        VaultEntry(
            title="Cursor AI",
            category="AI Tools",
            summary="AI-powered code editor with agentic workflows for rapid frontend prototyping.",
            official_link="https://cursor.com",
            source_url="https://instagram.com/reel/abc123",
            tools_mentioned=["Cursor", "Composer"],
        ),
        VaultEntry(
            title="System Role Architect",
            category="Prompts",
            summary="Building complex system role instructions and agentic personas for LLMs.",
            source_url="",
        ),
        VaultEntry(
            title="Shadcn/UI",
            category="Frameworks",
            summary="Copy-paste component library built on Radix UI and Tailwind CSS.",
            official_link="https://ui.shadcn.com",
            source_url="https://youtube.com/shorts/xyz789",
            tools_mentioned=["shadcn/ui", "Radix", "Tailwind"],
        ),
    ]

    # Test single entry
    print("═══ Single Entry ═══\n")
    print(generate_entry_md(sample_entries[0]))

    # Test standalone file
    print("═══ Standalone File ═══\n")
    print(generate_standalone_md(sample_entries[1]))

    # Test full vault
    print("═══ Full Vault.md ═══\n")
    print(generate_vault_md(sample_entries))
