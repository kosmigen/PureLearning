"""Render standalone Markdown images with their alt text as a caption."""

from xml.etree import ElementTree as ET

from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor


class ImageCaptions(Treeprocessor):
    def run(self, root):
        def visit(parent, in_figure=False):
            for element in list(parent):
                if not in_figure and element.tag == "p" and len(element) == 1 and not (element.text or "").strip():
                    child = element[0]
                    image = child if child.tag == "img" else (
                        child[0] if child.tag == "a" and len(child) == 1
                        and not (child.text or "").strip() else None
                    )
                    if image is not None and image.tag == "img" and not (child.tail or "").strip() and not (image.tail or "").strip():
                        caption = image.get("alt", "").strip()
                        if caption and not image.get("align"):
                            element.tag = "figure"
                            element.set("class", (element.get("class", "") + " kb-image").strip())
                            ET.SubElement(element, "figcaption").text = caption
                visit(element, in_figure or element.tag == "figure")
        visit(root)


class CaptionExtension(Extension):
    def extendMarkdown(self, md):
        md.treeprocessors.register(ImageCaptions(md), "image_captions", 7)


def on_config(config):
    config.markdown_extensions.append(CaptionExtension())
