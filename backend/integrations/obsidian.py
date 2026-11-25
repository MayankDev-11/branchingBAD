"""Export the local demo investigation graph as linked Obsidian notes."""

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from backend.data.db import loads
from backend.data.queries import build_branch, build_graph, build_record
from backend.data.store import store


def _links(record_ids: list[str]) -> str:
    return ", ".join(f"[[Records/{record_id}|{record_id}]]" for record_id in record_ids)


def build_vault() -> bytes:
    files = {}
    with store.connection() as conn:
        clock = store.clock
        graph = build_graph(conn, clock, store.range_start)
        index = ["# RootTrace", "", f"Demo as of {clock.isoformat()}", "", "## Investigations"]
        record_ids = set()
        for summary in graph["branches"]:
            branch = build_branch(conn, summary["id"], clock)
            if branch is None:
                continue
            branch_id = branch["id"]
            index.append(f"- [[Investigations/{branch_id}|{branch['title']}]]")
            lines = [f"# {branch['title']}", "", "[[RootTrace]]", "", f"Status: {branch['status']}"]
            event = branch["change_event"]
            if event:
                record_ids.update(event["record_ids"])
                lines.extend(["", "## Change event", event["label"], _links(event["record_ids"])])
            for hypothesis in branch["hypotheses"]:
                lines.extend(["", f"## {hypothesis['label']}", f"Proposed test: {hypothesis['test']}"])
                for claim in hypothesis["claims"]:
                    record_ids.update(claim["record_ids"])
                    lines.append(f"- {claim['text']} ({_links(claim['record_ids'])})")
            if branch["experiment"]:
                experiment = branch["experiment"]
                lines.extend(["", "## Experiment", experiment["description"],
                              f"Success criterion: {experiment['success_criterion']}",
                              f"Status: {experiment['status']}"])
            files[f"Investigations/{branch_id}.md"] = "\n".join(lines)

        index.extend(["", "## Knowledge"])
        for item in conn.execute(
            "SELECT id, branch_id, statement, record_ids FROM knowledge "
            "WHERE date <= ? AND invalidated_at IS NULL ORDER BY date, id",
            (clock.isoformat(),),
        ):
            lines = [f"# {item['statement']}", "", "[[RootTrace]]", f"[[Investigations/{item['branch_id']}]]"]
            citations = loads(item["record_ids"], [])
            if citations:
                lines.append(_links(citations))
                record_ids.update(citations)
            files[f"Knowledge/{item['id']}.md"] = "\n".join(lines)
            index.append(f"- [[Knowledge/{item['id']}|{item['statement']}]]")

        for record_id in sorted(record_ids):
            record = build_record(conn, record_id, clock)
            if record:
                files[f"Records/{record_id}.md"] = "\n".join([
                    f"# {record_id}", "", f"- Metric: {record['metric']}",
                    f"- Reading: {record['display']}", f"- Date: {record['date']}",
                    f"- Device: {record['device']}", f"- Source: {record['source_file']}",
                ])
        files["RootTrace.md"] = "\n".join(index)

    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for path, text in files.items():
            archive.writestr(path, text + "\n")
    return output.getvalue()
