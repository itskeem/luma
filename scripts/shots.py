#!/usr/bin/env python3
"""Renders the browser preview in headless WebKitGTK and saves screenshots.

Development aid only (checks layouts without a Windows machine). Run:
  xvfb-run -a python3 scripts/shots.py http://localhost:4173 /tmp/shots
"""
import json, sys, gi
gi.require_version("Gtk", "3.0"); gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, GLib, WebKit2

BASE, OUT = sys.argv[1], sys.argv[2]
W, H = 640, 520
CLICK_PILL = "(()=>{const e=document.querySelector('.face-pill');for(const t of ['pointerdown','pointerup'])e.dispatchEvent(new PointerEvent(t,{bubbles:true,button:0,buttons:t==='pointerdown'?1:0,clientX:5,clientY:5}))})()"
def click(label): return f"document.querySelector('[aria-label=\"{label}\"]').click()"
SHOTS = [
    ("01-collapsed-playing", "playing", []),
    ("02-music", "playing", [CLICK_PILL]),
    ("03-music-paused", "paused", [CLICK_PILL]),
    ("04-music-multi", "multi", [CLICK_PILL]),
    ("05-music-no-metadata", "no-metadata", [CLICK_PILL]),
    ("06-nothing-playing", "nothing-playing", [CLICK_PILL]),
    ("07-unavailable", "unavailable", [CLICK_PILL]),
    ("08-tools", "playing", [CLICK_PILL, click("Focus timer and clock")]),
    ("09-settings", "playing", [CLICK_PILL, click("Settings")]),
    ("10-collapsed-idle", "nothing-playing", []),
    ("11-music-compact", "playing", ["(()=>{})()", CLICK_PILL]),
]

# Pet mood screenshots — rendered from /pet.html?mood=<mood>&size=medium
PET_MOODS = ["sleeping", "idle", "grooving", "perk", "focused", "break", "celebrate", "happy", "carried"]
PET_SHOTS = [
    (f"pet-{m}", f"pet:{m}", [])
    for m in PET_MOODS
]

ALL_SHOTS = SHOTS + PET_SHOTS

win = Gtk.OffscreenWindow(); win.set_default_size(W, H)
view = WebKit2.WebView(); view.set_size_request(W, H)
view.set_background_color(__import__("gi").repository.Gdk.RGBA(0, 0, 0, 0))
win.add(view); win.show_all()
state = {"i": 0}

def next_shot():
    if state["i"] >= len(ALL_SHOTS): Gtk.main_quit(); return False
    name, scenario, steps = ALL_SHOTS[state["i"]]
    if scenario.startswith("pet:"):
        mood = scenario[4:]
        view.load_uri(f"{BASE}/pet.html?mood={mood}&size=medium&scenario=playing")
    else:
        view.load_uri(f"{BASE}/?scenario={scenario}")
    state["cur"] = (name, steps)
    return False

def on_load(v, ev):
    if ev != WebKit2.LoadEvent.FINISHED: return
    name, steps = state["cur"]
    def run(k):
        if k < len(steps):
            v.run_javascript(steps[k], None, None, None)
            GLib.timeout_add(900, lambda: (run(k + 1), False)[1])
        else:
            GLib.timeout_add(700, snap)
    GLib.timeout_add(900, lambda: (run(0), False)[1])

def snap():
    name, _ = state["cur"]
    def done(v, res):
        surf = v.get_snapshot_finish(res)
        surf.write_to_png(f"{OUT}/{name}.png")
        state["i"] += 1
        GLib.idle_add(next_shot)
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done)
    return False

view.connect("load-changed", on_load)
GLib.idle_add(next_shot)
Gtk.main()
