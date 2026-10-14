#!/usr/bin/env python3
"""Validate exported SBOL3 and SBML L3V2 example files.

Prints one JSON object with per-file error counts. Exits 0 when every
document validates.
"""

import json
import sys
from pathlib import Path

import libsbml
import sbol3


def validate_sbol(path: Path) -> dict:
    doc = sbol3.Document()
    doc.read(str(path), 'xml')
    report = doc.validate()
    errors = [str(err) for err in report.errors]
    return {"file": path.name, "format": "sbol3", "errors": len(errors), "messages": errors[:8]}


def validate_sbml(path: Path) -> dict:
    document = libsbml.readSBML(str(path))
    document.setConsistencyChecks(libsbml.LIBSBML_CAT_UNITS_CONSISTENCY, False)
    issues = document.checkConsistency()
    messages = []
    for index in range(issues):
        item = document.getError(index)
        messages.append(f"{item.getErrorId()}: {item.getMessage()}")
    return {
        "file": path.name,
        "format": "sbml",
        "read_errors": document.getNumErrors(),
        "consistency": issues,
        "messages": messages[:8],
    }


def main() -> int:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    reports = []
    failed = False
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() in {".sbol", ".xml", ".rdf"} and "sbml" not in path.name.lower():
            if path.suffix.lower() == ".xml" and path.name.lower().endswith(".sbml.xml"):
                continue
            report = validate_sbol(path)
            reports.append(report)
            failed = failed or report["errors"] != 0
        if path.suffix.lower() == ".sbml" or path.name.lower().endswith(".sbml.xml"):
            report = validate_sbml(path)
            reports.append(report)
            failed = failed or report["read_errors"] != 0 or report["consistency"] != 0
    print(json.dumps(reports, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
