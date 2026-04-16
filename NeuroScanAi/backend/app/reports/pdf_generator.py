"""Render segmentation report PDF from Jinja2 HTML."""

from __future__ import annotations

import io
import os

from jinja2 import Environment, FileSystemLoader, select_autoescape


def _html_to_pdf_pisa(html: str, output_path: str) -> None:
    try:
        from xhtml2pdf import pisa
    except ModuleNotFoundError as e:
        raise RuntimeError(
            "PDF dependency missing: install into the same Python environment as uvicorn "
            "(e.g. `backend\\venv\\Scripts\\pip install xhtml2pdf` or `pip install -r requirements.txt`), "
            "then restart the API."
        ) from e

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as out_file:
        status = pisa.CreatePDF(
            src=io.StringIO(html),
            dest=out_file,
            encoding="utf-8",
        )
    if status.err:
        raise RuntimeError("PDF generation failed (xhtml2pdf reported errors)")


def render_segmentation_report_pdf(
    context: dict,
    template_dir: str,
    template_name: str,
    output_path: str,
) -> str:
    env = Environment(
        loader=FileSystemLoader(template_dir),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template(template_name)
    html = template.render(**context)
    _html_to_pdf_pisa(html, output_path)
    return output_path
