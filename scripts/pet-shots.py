#!/usr/bin/env python3
"""Renders the pet window in each mood with headless WebKitGTK (development aid).
  xvfb-run -a python3 scripts/pet-shots.py http://localhost:4173 /tmp/pet-shots
"""
import sys, gi
gi.require_version("Gtk", "3.0"); gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, GLib, WebKit2, Gdk

BASE, OUT = sys.argv[1], sys.argv[2]
W = H = 170
MOODS = ["idle", "grooving", "perk", "focused", "break", "celebrate", "hello", "annoyed", "dizzy", "carried", "sleeping"]
SHOTS = [(m, f"mood={m}&size=large") for m in MOODS] + [
    ("look-right", "mood=idle&size=large&look=260,0"),
    ("look-up-left", "mood=idle&size=large&look=-200,-160"),
    ("medium-idle", "mood=idle&size=medium"),
    ("small-idle", "mood=idle&size=small"),
]
ONLY = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
if ONLY: SHOTS = [x for x in SHOTS if x[0] in ONLY]
win = Gtk.OffscreenWindow(); win.set_default_size(W, H)
view = WebKit2.WebView(); view.set_size_request(W, H)
view.set_background_color(Gdk.RGBA(0.09, 0.1, 0.14, 1))
win.add(view); win.show_all()
st = {"i": 0}

def nxt():
    if st["i"] >= len(SHOTS): Gtk.main_quit(); return False
    view.load_uri(f"{BASE}/pet.html?{SHOTS[st['i']][1]}"); return False

def loaded(v, ev):
    if ev == WebKit2.LoadEvent.FINISHED: GLib.timeout_add(1100, snap)

def snap():
    name = SHOTS[st["i"]][0]
    def done(v, res):
        v.get_snapshot_finish(res).write_to_png(f"{OUT}/{name}.png")
        st["i"] += 1; GLib.idle_add(nxt)
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done)
    return False

view.connect("load-changed", loaded)
GLib.idle_add(nxt); Gtk.main()
