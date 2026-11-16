"""Interfaz del overlay (Tkinter). Responsive: escala con el ancho, 1 o 2 columnas,
redimensionable desde la esquina y con pantalla completa en el monitor actual."""
import os
import re
import sys
import threading
import time

import ingame
import wincons

C = {
    "bg": "#010A13", "panel": "#0A1428", "card": "#0F1A2E", "card_hi": "#14223A",
    "line": "#1E2D45", "gold": "#C8AA6E", "gold_d": "#785A28", "gold_l": "#F0E6D2",
    "text": "#F0E6D2", "dim": "#A09B8C", "muted": "#6E6A62", "blue": "#0AC8B9",
    "good": "#2EBD85", "bad": "#E84057", "neutral": "#C8AA6E",
    "ad": "#E9853B", "ap": "#5C9DEB", "mix": "#B07DE8",
}
BASE_W = 400          # ancho de diseño (px lógicos)
TWO_COL_AT = 780      # desde este ancho lógico, dos columnas
BUILD_LABEL = {"default": "estándar", "vs_ad": "vs equipo AD", "vs_ap": "vs equipo AP"}
DIFF = {"easy": ("FÁCIL", "good"), "skill": ("PAREJO", "neutral"), "hard": ("DIFÍCIL", "bad"),
        "xhard": ("MUY DIFÍCIL", "bad")}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _dpi_aware():
    if sys.platform != "win32":
        return
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def _work_area(root):
    """Área de trabajo del monitor donde está la ventana (x, y, w, h)."""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class MONITORINFO(ctypes.Structure):
                _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                            ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]
            user32 = ctypes.windll.user32
            hwnd = user32.GetParent(root.winfo_id()) or root.winfo_id()
            hmon = user32.MonitorFromWindow(hwnd, 2)
            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            if user32.GetMonitorInfoW(hmon, ctypes.byref(mi)):
                r = mi.rcWork
                return r.left, r.top, r.right - r.left, r.bottom - r.top
        except Exception:
            pass
    return 0, 0, root.winfo_screenwidth(), root.winfo_screenheight() - 40


def run_gui(engine, plan_for, game_sig, render_text):
    _dpi_aware()
    import tkinter as tk
    import tkinter.font as tkfont

    root = tk.Tk()
    root.title("LoL Pick Helper")
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    root.configure(bg=C["gold_d"])
    K = max(1.0, root.winfo_fpixels("1i") / 96.0)   # escalado de Windows (125%, 150%...)
    root.geometry(f"{int(BASE_W * K)}x{int(220 * K)}+{int(24 * K)}+{int(80 * K)}")

    fams = set(tkfont.families())
    base = "Segoe UI" if "Segoe UI" in fams else "Helvetica"
    semi = "Segoe UI Semibold" if "Segoe UI Semibold" in fams else base

    st = {"sig": None, "compact": "--compact" in sys.argv, "dirty": False, "U": 1.0, "cols": 1,
          "manual": False, "max": None, "w": int(BASE_W * K), "h_auto": None, "resize_pending": None}

    def U():
        return st["U"]

    def F(size, weight="normal"):
        sz = max(7, int(round(size * U())))
        return (semi if weight == "semi" else base, sz, "bold" if weight == "bold" else "normal")

    def px(n):
        return max(1, int(round(n * K * U())))

    shell = tk.Frame(root, bg=C["bg"])
    shell.pack(fill="both", expand=True, padx=1, pady=1)

    # ---------------- encabezado
    header = tk.Frame(shell, bg=C["panel"])
    header.pack(fill="x")
    tk.Frame(shell, bg=C["gold_d"], height=1).pack(fill="x")
    hdr = {}

    def build_header():
        for c in header.winfo_children():
            c.destroy()
        inner = tk.Frame(header, bg=C["panel"], height=px(36))
        inner.pack(fill="x")
        inner.pack_propagate(False)
        tk.Label(inner, text="◆", bg=C["panel"], fg=C["gold"], font=F(10)).pack(side="left", padx=(px(12), px(6)))
        t = tk.Label(inner, text="PICK HELPER", bg=C["panel"], fg=C["gold"], font=F(10, "bold"))
        t.pack(side="left")
        btns = []
        for txt, cmd in (("✕", lambda e: root.destroy()), ("▢", lambda e: toggle_max()), ("—", lambda e: toggle_compact())):
            b = tk.Label(inner, text=txt, bg=C["panel"], fg=C["dim"], font=F(11), cursor="hand2", padx=px(8))
            b.pack(side="right", fill="y")
            b.bind("<Button-1>", cmd)
            b.bind("<Enter>", lambda e, w=b: w.configure(fg=C["gold_l"]))
            b.bind("<Leave>", lambda e, w=b: w.configure(fg=C["dim"]))
            btns.append(b)
        hdr["status"] = tk.Label(inner, text="", bg=C["panel"], fg=C["dim"], font=F(8))
        hdr["status"].pack(side="right", padx=(0, px(4)))
        hdr["dot"] = tk.Canvas(inner, width=px(10), height=px(10), bg=C["panel"], highlightthickness=0)
        hdr["dot"].pack(side="right", padx=(0, px(6)))
        for w in (inner, t):
            w.bind("<Button-1>", d_start)
            w.bind("<B1-Motion>", d_move)
            w.bind("<Double-Button-1>", lambda e: toggle_max())

    drag = {"x": 0, "y": 0}

    def d_start(e):
        drag["x"], drag["y"] = e.x_root - root.winfo_x(), e.y_root - root.winfo_y()

    def d_move(e):
        if st["max"]:
            return
        root.geometry(f"+{e.x_root - drag['x']}+{e.y_root - drag['y']}")

    def set_status(kind, msg):
        d = hdr.get("dot")
        if not d:
            return
        d.delete("all")
        col = {"live": C["good"], "ingame": C["blue"], "game": C["blue"], "idle": C["gold"]}.get(kind, C["bad"])
        d.create_oval(1, 1, px(9), px(9), fill=col, width=0)
        txt = {"live": "CHAMP SELECT", "ingame": "EN PARTIDA", "game": "EN PARTIDA", "idle": "CONECTADO"}.get(kind, "SIN CLIENTE")
        if msg.startswith("DEMO"):
            txt = msg.upper()
        hdr["status"].configure(text=txt)

    # ---------------- cuerpo con scroll
    sc = tk.Canvas(shell, bg=C["bg"], highlightthickness=0, bd=0)
    sc.pack(fill="both", expand=True)
    cur = {"body": tk.Frame(sc, bg=C["bg"])}
    sc_win = sc.create_window(0, 0, window=cur["body"], anchor="nw")

    def on_wheel(e):
        if cur["body"].winfo_reqheight() > sc.winfo_height():
            step = -1 if (getattr(e, "delta", 0) > 0 or getattr(e, "num", 0) == 4) else 1
            sc.yview_scroll(step * 3, "units")

    root.bind_all("<MouseWheel>", on_wheel)
    root.bind_all("<Button-4>", on_wheel)
    root.bind_all("<Button-5>", on_wheel)

    # ---------------- redimensionar
    try:
        grip = tk.Label(shell, text="◢", bg=C["bg"], fg=C["gold_d"], font=(base, 10), cursor="size_nw_se")
    except tk.TclError:
        grip = tk.Label(shell, text="◢", bg=C["bg"], fg=C["gold_d"], font=(base, 10), cursor="bottom_right_corner")
    grip.place(relx=1.0, rely=1.0, anchor="se")
    rs = {}

    def g_start(e):
        rs.update(x=e.x_root, y=e.y_root, w=root.winfo_width(), h=root.winfo_height())

    def g_move(e):
        w = max(int(300 * K), rs["w"] + e.x_root - rs["x"])
        h = max(int(160 * K), rs["h"] + e.y_root - rs["y"])
        st["manual"] = True
        st["max"] = None
        root.geometry(f"{w}x{h}")

    grip.bind("<Button-1>", g_start)
    grip.bind("<B1-Motion>", g_move)

    def toggle_max():
        if st["max"]:
            root.geometry(st["max"])
            st["max"] = None
            st["manual"] = False
        else:
            st["max"] = root.geometry()
            x, y, w, h = _work_area(root)
            root.geometry(f"{w}x{h}+{x}+{y}")
            st["manual"] = True
        schedule_relayout()

    def toggle_compact():
        st["compact"] = not st["compact"]
        st["sig"] = None

    def on_configure(e):
        if e.widget is root and abs(root.winfo_width() - st["w"]) > 4:
            schedule_relayout()

    def schedule_relayout():
        if st["resize_pending"]:
            root.after_cancel(st["resize_pending"])
        st["resize_pending"] = root.after(180, relayout)

    def relayout():
        st["resize_pending"] = None
        root.update_idletasks()
        w = root.winfo_width()
        if w < 100:
            w = st["w"]
        st["w"] = w
        logical = w / K
        st["cols"] = 2 if logical >= TWO_COL_AT else 1
        colw = logical / st["cols"]
        st["U"] = max(0.85, min(1.7, colw / BASE_W)) if st["cols"] == 1 else max(0.9, min(1.6, colw / (BASE_W * 1.05)))
        build_header()
        st["sig"] = None

    root.bind("<Configure>", on_configure)

    # ---------------- imágenes
    photos = {}
    waiting = []
    engine.dd.on_image = lambda: st.__setitem__("dirty", True)

    def photo(kind, name, size):
        key = (kind, norm(name), size)
        if key in photos:
            return photos[key]
        p = engine.dd.request(kind, name)
        if not p:
            return None
        try:
            img = tk.PhotoImage(file=p)
        except tk.TclError:
            return None
        w = img.width() or size
        best = None
        for z in range(1, 7):
            s_ = max(1, round(w * z / size))
            err = abs(w * z / s_ - size)
            if best is None or err < best[0]:
                best = (err, z, s_)
        _, z, s_ = best
        if z > 1:
            img = img.zoom(z)
        if s_ > 1:
            img = img.subsample(s_)
        photos[key] = img
        return img

    tip = {"w": None}

    def show_tip(widget, text):
        hide_tip()
        tw = tk.Toplevel(root)
        tw.overrideredirect(True)
        tw.attributes("-topmost", True)
        tk.Label(tw, text=text, bg=C["panel"], fg=C["gold_l"], font=F(9), padx=px(8), pady=px(4), justify="left",
                 highlightthickness=1, highlightbackground=C["gold_d"]).pack()
        tw.geometry(f"+{widget.winfo_rootx()}+{widget.winfo_rooty() + widget.winfo_height() + 4}")
        tip["w"] = tw

    def hide_tip(_=None):
        if tip["w"] is not None:
            tip["w"].destroy()
            tip["w"] = None

    def bind_tip(widget, text):
        for w in [widget] + list(widget.winfo_children()) + [g for c in widget.winfo_children() for g in c.winfo_children()]:
            w.bind("<Enter>", lambda e, t=text: show_tip(widget, t), add="+")
            w.bind("<Leave>", hide_tip, add="+")

    def icon(parent, kind, name, size, border=None, bg=None, tip_text=None):
        size = px(size)
        bg = bg or parent["bg"]
        holder = tk.Frame(parent, bg=border or bg, padx=1 if border else 0, pady=1 if border else 0)
        img = photo(kind, name, size)
        if img is not None:
            tk.Label(holder, image=img, bg=bg, bd=0).pack()
        else:
            waiting.append((holder, kind, name, size, bg, tip_text or name))
            ph = tk.Frame(holder, bg=C["card_hi"], width=size, height=size)
            ph.pack_propagate(False)
            ph.pack()
            ini = "".join(w[0] for w in re.findall(r"[A-Za-z']+", name or "?")[:2]).upper() or "?"
            tk.Label(ph, text=ini, bg=C["card_hi"], fg=C["dim"],
                     font=(base, max(7, size // 4), "bold")).place(relx=.5, rely=.5, anchor="center")
        bind_tip(holder, tip_text or name)
        return holder

    def fill_waiting():
        still = []
        for holder, kind, name, size, bg, ttxt in waiting:
            if not holder.winfo_exists():
                continue
            img = photo(kind, name, size)
            if img is None:
                still.append((holder, kind, name, size, bg, ttxt))
                continue
            for ch in holder.winfo_children():
                ch.destroy()
            lb = tk.Label(holder, image=img, bg=bg, bd=0)
            lb.pack()
            lb.bind("<Enter>", lambda e, h=holder, t=ttxt: show_tip(h, t), add="+")
            lb.bind("<Leave>", hide_tip, add="+")
        waiting[:] = still

    # ---------------- piezas de UI
    def colw_px():
        return int(st["w"] / st["cols"])

    def wrap(extra=40):
        return max(150, colw_px() - px(extra))

    def section(parent, text, right=None, top=12):
        row = tk.Frame(parent, bg=parent["bg"])
        row.pack(fill="x", padx=px(14), pady=(px(top), px(5)))
        tk.Label(row, text=text.upper(), bg=parent["bg"], fg=C["gold"], font=F(8, "bold")).pack(side="left")
        if right:
            tk.Label(row, text=right, bg=parent["bg"], fg=C["muted"], font=F(8)).pack(side="right")
        tk.Frame(row, bg=C["line"], height=1).pack(side="left", fill="x", expand=True, padx=(px(8), px(8) if right else 0))
        return row

    def caption(parent, text, fg=None, size=8, bold=False, extra=40):
        return tk.Label(parent, text=text, bg=parent["bg"], fg=fg or C["dim"], font=F(size, "bold" if bold else "normal"),
                        justify="left", anchor="w", wraplength=wrap(extra))

    def pill(parent, text, fg, bg):
        return tk.Label(parent, text=f" {text} ", bg=bg, fg=fg, font=F(7, "bold"), padx=px(3), pady=1)

    def bar(parent, w, h, parts):
        cv = tk.Canvas(parent, width=w, height=h, bg=C["line"], highlightthickness=0)
        x = 0
        tot = sum(v for v, _ in parts) or 1
        for v, col in parts:
            dx = w * v / tot
            if dx > 0:
                cv.create_rectangle(x, 0, x + dx, h, fill=col, width=0)
            x += dx
        return cv

    def wr_bar(parent, wr, w, h):
        cv = tk.Canvas(parent, width=w, height=h, bg=C["line"], highlightthickness=0)
        pos = max(0, min(1, (wr - 40) / 20)) * w
        mid = w / 2
        col = C["good"] if wr >= 51.5 else C["bad"] if wr <= 48.5 else C["neutral"]
        cv.create_rectangle(min(mid, pos), 0, max(mid, pos), h, fill=col, width=0)
        cv.create_line(mid, 0, mid, h, fill=C["dim"])
        return cv

    def item_row(parent, names, size=32, arrows=False, kind="item", bg=None):
        bg = bg or parent["bg"]
        row = tk.Frame(parent, bg=bg)
        for i, n in enumerate(names):
            if i and arrows:
                tk.Label(row, text="›", bg=bg, fg=C["gold_d"], font=F(13)).pack(side="left", padx=px(3))
            icon(row, kind, n, size, border=C["gold_d"], bg=bg).pack(side="left", padx=(0, 0 if arrows else px(4)))
        return row

    def card(parent, hi=False, border=None, top=8):
        f = tk.Frame(parent, bg=C["card_hi"] if hi else C["card"], highlightthickness=1,
                     highlightbackground=border or (C["gold"] if hi else C["line"]))
        f.pack(fill="x", padx=px(14), pady=(px(top), 0))
        inner = tk.Frame(f, bg=f["bg"])
        inner.pack(fill="x", padx=px(10), pady=px(8))
        return inner

    DMG = {"AD": C["ad"], "AP": C["ap"], "MIX": C["mix"], "?": C["muted"]}

    # ---------------- guía de línea (champ select y partida)
    def guide_card(parent, guide, enemy, my_level=None):
        if not guide:
            return
        pro = guide.get("src") == "pro"
        g = card(parent, border=C["gold"] if pro else C["line"], top=10)
        hd = tk.Frame(g, bg=g["bg"])
        hd.pack(fill="x")
        tk.Label(hd, text=f"CÓMO JUGAR LA LÍNEA VS {enemy.upper()}", bg=g["bg"], fg=C["gold"], font=F(8, "bold")).pack(side="left")
        pill(hd, "PRO" if pro else "ANÁLISIS", C["bg"], C["gold"] if pro else C["muted"]).pack(side="right")
        phase = None if my_level is None else ("pre" if my_level < 6 else "post")

        def block(title, lines, tone=None, bullet=True, active=True):
            col = C["text"] if active else C["muted"]
            tk.Label(g, text=title, bg=g["bg"], fg=(tone or C["gold"]) if active else C["muted"],
                     font=F(7, "bold")).pack(anchor="w", pady=(px(7), 0))
            for ln in lines:
                tk.Label(g, text=("•  " if bullet else "") + ln, bg=g["bg"], fg=col, font=F(9 if active else 8),
                         justify="left", anchor="w", wraplength=wrap(70)).pack(anchor="w", pady=(px(1), 0))

        if phase is None or (my_level or 0) <= 3:
            block("NIVEL 1", [guide["lv1"]], bullet=False)
        if phase in (None, "pre"):
            block("HASTA EL NIVEL 6", guide["pre6"])
        if phase in (None, "post"):
            block("DESDE EL 6" if phase is None else "YA SOS NIVEL 6+", [guide["post6"]], bullet=False)
        else:
            block("CUANDO LLEGUES AL 6", [guide["post6"]], bullet=False, active=False)
        if guide.get("evitar") and guide["evitar"] != "—":
            block("NO HAGAS ESTO", [guide["evitar"]], tone=C["bad"], bullet=False)
        tk.Label(g, text="Fuente: " + guide.get("por", ""), bg=g["bg"], fg=C["muted"], font=F(7),
                 justify="left", anchor="w", wraplength=wrap(70)).pack(anchor="w", pady=(px(6), 0))

    def pro_card(parent, pr):
        dlabel, dtone = DIFF[pr["diff"]]
        dcol = {"good": C["good"], "bad": C["bad"], "neutral": C["gold"]}[dtone]
        g = card(parent, border=C["gold_d"], top=10)
        hd = tk.Frame(g, bg=g["bg"])
        hd.pack(fill="x")
        tk.Label(hd, text="★ CHALLENGER · FEDERALS1", bg=g["bg"], fg=C["gold"], font=F(7, "bold")).pack(side="left")
        pill(hd, dlabel, C["bg"], dcol).pack(side="right")
        ic = tk.Frame(g, bg=g["bg"])
        ic.pack(anchor="w", pady=(px(6), 0))
        icon(ic, "item", pr["start"], 28, border=C["gold_d"], bg=g["bg"]).pack(side="left")
        tk.Label(ic, text="›", bg=g["bg"], fg=C["gold_d"], font=F(12)).pack(side="left", padx=px(3))
        icon(ic, "rune", pr["keystone"], 30, bg=g["bg"]).pack(side="left")
        if pr.get("rush"):
            tk.Label(ic, text="›", bg=g["bg"], fg=C["gold_d"], font=F(12)).pack(side="left", padx=px(3))
            icon(ic, "item", pr["rush"], 28, border=C["gold_d"], bg=g["bg"]).pack(side="left")
        if pr.get("spell"):
            tk.Label(ic, text="+", bg=g["bg"], fg=C["gold_d"], font=F(11)).pack(side="left", padx=px(4))
            icon(ic, "spell", pr["spell"], 24, border=C["gold_d"], bg=g["bg"]).pack(side="left")
        txt = f"{pr['start']} · {pr['keystone']}" + (f" · rush {pr['rush']}" if pr.get("rush") else "") \
            + (f" · {pr['spell']}" if pr.get("spell") else "")
        tk.Label(g, text=txt, bg=g["bg"], fg=C["dim"], font=F(8), justify="left", anchor="w",
                 wraplength=wrap(70)).pack(anchor="w", pady=(px(4), 0))

    # ---------------- vista: champ select
    def draw_select(cols, v):
        A, B = cols[0], cols[-1]
        compact = st["compact"]
        if not compact:
            section(A, "Equipo rival", f"AD {v['ad']:g} · AP {v['ap']:g}" if v["enemies"] else None)
            er = tk.Frame(A, bg=C["bg"])
            er.pack(fill="x", padx=px(14))
            if v["enemies"]:
                ic = tk.Frame(er, bg=C["bg"])
                ic.pack(anchor="w")
                for e in v["enemies"]:
                    top_ = v["lane_enemy"] and norm(e["name"]) == norm(v["lane_enemy"])
                    cell = tk.Frame(ic, bg=C["bg"])
                    cell.pack(side="left", padx=(0, px(6)))
                    icon(cell, "champion", e["name"], 40 if top_ else 34, border=C["gold"] if top_ else DMG[e["dmg"]]).pack()
                    tk.Label(cell, text="TOP" if top_ else (e["dmg"] if e["dmg"] != "?" else ""), bg=C["bg"],
                             fg=C["gold"] if top_ else DMG[e["dmg"]], font=F(7, "bold")).pack()
                bar(er, colw_px() - px(30), px(4), [(v["ad"], C["ad"]), (v["ap"], C["ap"])]).pack(anchor="w", pady=(px(6), 0))
            else:
                caption(er, "Todavía nadie pickeó.", C["dim"], 9).pack(anchor="w")

        sup_mode = v.get("mode") == "support"
        if sup_mode:
            tb = card(A, top=10)
            row = tk.Frame(tb, bg=tb["bg"])
            row.pack(fill="x")
            l_ = tk.Frame(row, bg=tb["bg"])
            l_.pack(side="left")
            tk.Label(l_, text="TU ADC" + ("" if v.get("ally_adc_locked") or not v.get("ally_adc") else " (hover)"),
                     bg=tb["bg"], fg=C["muted"], font=F(7, "bold")).pack(anchor="w")
            if v.get("ally_adc"):
                rr = tk.Frame(l_, bg=tb["bg"])
                rr.pack(anchor="w", pady=(px(3), 0))
                icon(rr, "champion", v["ally_adc"], 30, border=C["good"], bg=tb["bg"]).pack(side="left")
                tk.Label(rr, text=v["ally_adc"], bg=tb["bg"], fg=C["gold_l"], font=F(11, "semi")).pack(side="left", padx=px(8))
                ah = v.get("adc_hist")
                if ah and ah.get("g"):
                    col = C["good"] if ah["w"] * 2 > ah["g"] else C["bad"] if ah["w"] * 2 < ah["g"] else C["dim"]
                    tk.Label(l_, text=f"Vos de support con {v['ally_adc']}: {ah['w']}-{ah['g'] - ah['w']}",
                             bg=tb["bg"], fg=col, font=F(8)).pack(anchor="w", pady=(px(2), 0))
            else:
                tk.Label(l_, text="Todavía no eligió", bg=tb["bg"], fg=C["dim"], font=F(10)).pack(anchor="w", pady=(px(3), 0))
            r_ = tk.Frame(row, bg=tb["bg"])
            r_.pack(side="right")
            tk.Label(r_, text="LÍNEA RIVAL", bg=tb["bg"], fg=C["bad"], font=F(7, "bold")).pack(anchor="e")
            ri = tk.Frame(r_, bg=tb["bg"])
            ri.pack(anchor="e", pady=(px(3), 0))
            for n, lab in ((v.get("enemy_adc"), "ADC"), (v.get("lane_enemy"), "SUP")):
                cell = tk.Frame(ri, bg=tb["bg"])
                cell.pack(side="left", padx=(px(4), 0))
                if n:
                    icon(cell, "champion", n, 30, border=C["bad"], bg=tb["bg"]).pack()
                else:
                    tk.Label(cell, text="?", bg=C["card_hi"], fg=C["dim"], width=3, font=F(10, "bold")).pack()
                tk.Label(cell, text=lab, bg=tb["bg"], fg=C["muted"], font=F(6, "bold")).pack()
            if v["ban_sugg"]:
                br = tk.Frame(tb, bg=tb["bg"])
                br.pack(fill="x", pady=(px(8), 0))
                tk.Label(br, text="BANEÁ", bg=tb["bg"], fg=C["bad"], font=F(7, "bold")).pack(side="left")
                for n in v["ban_sugg"]:
                    icon(br, "champion", n, 24, border=C["bad"], bg=tb["bg"]).pack(side="left", padx=(px(6), 0))
        tb = card(A, top=10) if not sup_mode else None
        left = tk.Frame(tb, bg=tb["bg"]) if tb else None
        if left is not None:
            left.pack(side="left")
            tk.Label(left, text="RIVAL DE TOP", bg=tb["bg"], fg=C["muted"], font=F(7, "bold")).pack(anchor="w")
        if left is not None and v["lane_enemy"]:
            rr = tk.Frame(left, bg=tb["bg"])
            rr.pack(anchor="w", pady=(px(3), 0))
            icon(rr, "champion", v["lane_enemy"], 28, border=C["gold"], bg=tb["bg"]).pack(side="left")
            tk.Label(rr, text=v["lane_enemy"], bg=tb["bg"], fg=C["gold_l"], font=F(11, "semi")).pack(side="left", padx=px(8))
        elif left is not None:
            tk.Label(left, text="Pick a ciegas", bg=tb["bg"], fg=C["gold_l"], font=F(11, "semi")).pack(anchor="w", pady=(px(3), 0))
        if v["ban_sugg"] and not sup_mode:
            right = tk.Frame(tb, bg=tb["bg"])
            right.pack(side="right")
            tk.Label(right, text="BANEÁ", bg=tb["bg"], fg=C["bad"], font=F(7, "bold")).pack(anchor="e")
            bi = tk.Frame(right, bg=tb["bg"])
            bi.pack(anchor="e", pady=(px(3), 0))
            for n in v["ban_sugg"]:
                icon(bi, "champion", n, 28, border=C["bad"], bg=tb["bg"]).pack(side="left", padx=(px(4), 0))

        section(A, "Tu support" if sup_mode else "Tu pick", "mejores 5" if sup_mode else None)
        for i, r in enumerate(v["recs"]):
            ok = r["status"] == "ok"
            best = i == 0 and ok
            c = card(A, hi=best, top=3)
            row = tk.Frame(c, bg=c["bg"])
            row.pack(fill="x")
            icon(row, "champion", r["name"], 44 if best else 36, border=C["gold"] if best else C["gold_d"], bg=c["bg"]).pack(side="left")
            scv = r["score"]
            scol = C["good"] if scv > 0.5 else C["bad"] if scv < -0.5 else C["neutral"]
            tk.Label(row, text=f"{scv:+.1f}", bg=c["bg"], fg=scol if ok else C["muted"], font=F(14 if best else 12, "bold")).pack(side="right")
            mid = tk.Frame(row, bg=c["bg"])
            mid.pack(side="left", fill="x", expand=True, padx=px(10))
            t = tk.Frame(mid, bg=c["bg"])
            t.pack(anchor="w", fill="x")
            tk.Label(t, text=r["name"], bg=c["bg"], fg=C["gold_l"] if ok else C["muted"], font=F(13 if best else 11, "semi")).pack(side="left")
            if best:
                pill(t, "RECOMENDADO", C["bg"], C["gold"]).pack(side="left", padx=px(8))
            if not ok:
                pill(t, r["status"], C["text"], C["bad"] if r["status"] == "BANEADO" else C["muted"]).pack(side="left", padx=px(8))
            if r["lane"]:
                m = r["lane"][1]
                pr = m.get("pro")
                sub = tk.Frame(mid, bg=c["bg"])
                sub.pack(anchor="w", pady=(px(2), 0))
                wc = C["good"] if m["wr"] >= 51.5 else C["bad"] if m["wr"] <= 48.5 else C["neutral"]
                tk.Label(sub, text=f"{m['wr']:.1f}%", bg=c["bg"], fg=wc if ok else C["muted"], font=F(10, "bold")).pack(side="left")
                tk.Label(sub, text=f" vs {r['lane'][0]}" + ("" if sup_mode else f" · {m['games']:,} partidas"), bg=c["bg"], fg=C["dim"], font=F(8)).pack(side="left")
                if pr:
                    dl, dt = DIFF[pr["diff"]]
                    pill(sub, dl, C["bg"], {"good": C["good"], "bad": C["bad"], "neutral": C["gold"]}[dt]).pack(side="left", padx=px(6))
                wr_bar(mid, m["wr"], min(px(180), colw_px() - px(150)), px(4)).pack(anchor="w", pady=(px(4), 0))
            elif not sup_mode:
                tk.Label(mid, text="Seguro a ciegas" if r["cfg"].get("blind", 0) >= 1 else "Mejor si ves al rival",
                         bg=c["bg"], fg=C["dim"], font=F(8)).pack(anchor="w", pady=(px(2), 0))
            if sup_mode:
                ex = tk.Frame(mid, bg=c["bg"])
                ex.pack(anchor="w", pady=(px(3), 0))
                if r.get("arch"):
                    pill(ex, r["arch"], C["text"], C["line"]).pack(side="left")
                if r.get("syn"):
                    d = r["syn"][1]["delta"]
                    col = C["good"] if d >= 0.5 else C["bad"] if d <= -0.5 else C["gold"]
                    if r["syn"][1].get("est"):
                        tk.Label(ex, text=f"  ≈{d:+.1f} con {r['syn'][0]} (estimado por tipo)", bg=c["bg"],
                                 fg=col if abs(d) >= 0.5 else C["dim"], font=F(8)).pack(side="left")
                    else:
                        tk.Label(ex, text=f"  sinergia {d:+.1f} con {r['syn'][0]}", bg=c["bg"], fg=col, font=F(8, "bold")).pack(side="left")
                elif v.get("ally_adc"):
                    tk.Label(ex, text=f"  dúo casi no jugado con {v['ally_adc']}", bg=c["bg"], fg=C["muted"], font=F(8)).pack(side="left")
                mi = r.get("mine")
                if mi:
                    pr = mi.get("pair")
                    txt = (f"  · vos: {pr['w']}-{pr['g'] - pr['w']} con {v['ally_adc']}" if pr
                           else f"  · vos: {mi['w']}-{mi['g'] - mi['w']}")
                    tk.Label(ex, text=txt, bg=c["bg"], fg=C["gold_l"], font=F(8)).pack(side="left")
                if not r["lane"]:
                    tk.Label(ex, text=f"  · WR general {r['cfg']['tier_wr']:.1f}%", bg=c["bg"], fg=C["dim"], font=F(8)).pack(side="left")

        f = v["focus"]
        if not f:
            return
        m = f["lane"][1] if f["lane"] else {}
        gd = f.get("guide") or m.get("guide")
        if gd:
            guide_card(B, gd, f["lane"][0] if f["lane"] else (v.get("lane_enemy") or "tu línea"))
        if compact:
            return
        p = plan_for(f, v["build_key"])
        section(B, f"Plan · {f['name']}", BUILD_LABEL[v["build_key"]])
        g = tk.Frame(B, bg=C["bg"])
        g.pack(fill="x", padx=px(14))
        r1 = tk.Frame(g, bg=C["bg"])
        r1.pack(fill="x")
        for title, names in (("INICIO", p["start"]), ("BOTAS", [p["boots"]]), ("1° VS RIVAL", p["first"] or [])):
            if not names:
                continue
            cbox = tk.Frame(r1, bg=C["bg"])
            cbox.pack(side="left", padx=(0, px(16)))
            caption(cbox, title, C["muted"], 7, bold=True).pack(anchor="w")
            item_row(cbox, names, 32).pack(anchor="w", pady=(px(3), 0))
        if p["start_note"]:
            caption(g, p["start_note"], C["muted"], 8).pack(anchor="w", pady=(px(3), 0))
        caption(g, "BUILD", C["muted"], 7, bold=True).pack(anchor="w", pady=(px(8), 0))
        item_row(g, p["build"], 36, arrows=True).pack(anchor="w", pady=(px(3), 0))
        rr = tk.Frame(g, bg=C["bg"])
        rr.pack(fill="x", pady=(px(8), 0))
        rc = tk.Frame(rr, bg=C["bg"])
        rc.pack(side="left")
        caption(rc, "RUNAS · " + p["runes"]["keystone"].upper(), C["muted"], 7, bold=True).pack(anchor="w")
        ru = tk.Frame(rc, bg=C["bg"])
        ru.pack(anchor="w", pady=(px(3), 0))
        icon(ru, "rune", p["runes"]["keystone"], 40,
             tip_text=p["runes"]["keystone"] + ("\n" + p["runes"]["alt"] if p["runes"].get("alt") else "")).pack(side="left")
        mi = tk.Frame(ru, bg=C["bg"])
        mi.pack(side="left", padx=(px(6), 0))
        for n in p["runes"]["primary"] + p["runes"]["secondary"]:
            icon(mi, "rune", n, 22).pack(side="left", padx=1)
        sk = tk.Frame(rr, bg=C["bg"])
        sk.pack(side="right")
        caption(sk, "HECHIZOS · SKILLS", C["muted"], 7, bold=True).pack(anchor="e")
        sp = tk.Frame(sk, bg=C["bg"])
        sp.pack(anchor="e", pady=(px(3), 0))
        for n in p["spells"]:
            icon(sp, "spell", n, 26, border=C["gold_d"]).pack(side="left", padx=(0, px(3)))
        ks = tk.Frame(sk, bg=C["bg"])
        ks.pack(anchor="e", pady=(px(4), 0))
        for i, k in enumerate(p["skills"]):
            if i:
                tk.Label(ks, text="›", bg=C["bg"], fg=C["gold_d"], font=F(10)).pack(side="left")
            tk.Label(ks, text=k, bg=C["card_hi"], fg=C["gold_l"], font=F(9, "bold"), width=2,
                     highlightthickness=1, highlightbackground=C["gold_d"]).pack(side="left", padx=1)
        if p["pro"]:
            pro_card(B, p["pro"])
        if p["tip"] and not gd:
            caption(B, "En línea: " + p["tip"], C["text"], 9).pack(fill="x", padx=px(14), pady=(px(8), 0))
        caption(B, p["general"], C["dim"], 8, extra=30).pack(fill="x", padx=px(14), pady=(px(8), 0))

    # ---------------- vista: partida
    live = {}

    def fmt_t(t):
        return "VIVO" if t <= 0 else f"{int(t // 60)}:{int(t % 60):02d}"

    def update_live(v):
        if live.get("time") and live["time"].winfo_exists():
            live["time"].configure(text=fmt_t(v["time"]) if v["time"] > 0 else "0:00")
        if live.get("gold") and live["gold"].winfo_exists():
            live["gold"].configure(text=f"{v['gold']:,}".replace(",", "."))
        b = v["buy"]
        if live.get("missing") and live["missing"].winfo_exists() and b and b["missing"] > 0:
            live["missing"].configure(text=f"Te faltan {b['missing']} de oro")
        for lbl_, idx in live.get("objs", []):
            if lbl_.winfo_exists():
                lbl_.configure(text=fmt_t(v["objectives"][idx][1]))

    def draw_game_header(body, v):
        me = v["me"]
        top = tk.Frame(body, bg=C["panel"])
        top.pack(fill="x")
        ti = tk.Frame(top, bg=C["panel"])
        ti.pack(fill="x", padx=px(14), pady=px(8))
        icon(ti, "champion", me["champ"], 36, border=C["gold"], bg=C["panel"]).pack(side="left")
        info = tk.Frame(ti, bg=C["panel"])
        info.pack(side="left", padx=px(10))
        tk.Label(info, text=me["champ"], bg=C["panel"], fg=C["gold_l"], font=F(11, "semi")).pack(anchor="w")
        tk.Label(info, text=f"Nivel {me['level']} · {me['kda']} · {me['cs']} CS", bg=C["panel"], fg=C["dim"], font=F(8)).pack(anchor="w")
        rt = tk.Frame(ti, bg=C["panel"])
        rt.pack(side="right")
        live["gold"] = tk.Label(rt, text="", bg=C["panel"], fg=C["gold"], font=F(15, "bold"))
        live["gold"].pack(anchor="e")
        live["time"] = tk.Label(rt, text="", bg=C["panel"], fg=C["muted"], font=F(8))
        live["time"].pack(anchor="e")
        tk.Frame(body, bg=C["line"], height=1).pack(fill="x")

    def draw_game(cols, v):
        A, B = cols[0], cols[-1]
        me = v["me"]
        compact = st["compact"]
        TONE = {"good": C["good"], "bad": C["bad"], "neutral": C["gold"]}
        b = v["buy"]
        if not v["in_pool"]:
            caption(A, f"{me['champ']} no está en tu pool: no tengo build para recomendarte.", C["dim"], 9) \
                .pack(fill="x", padx=px(14), pady=(px(10), 0))
        elif b:
            ok = b["missing"] == 0
            c = card(A, hi=True, border=C["gold"] if ok else C["line"], top=10)
            hd = tk.Frame(c, bg=c["bg"])
            hd.pack(fill="x")
            tk.Label(hd, text="COMPRÁ AHORA" if ok else "PRÓXIMA COMPRA", bg=c["bg"], fg=C["gold"] if ok else C["dim"],
                     font=F(8, "bold")).pack(side="left")
            if ok:
                pill(hd, f"{b['cost']} de oro", C["bg"], C["gold"]).pack(side="right")
            row = tk.Frame(c, bg=c["bg"])
            row.pack(anchor="w", pady=(px(6), 0))
            buys = b["items"] + ([b["extra"]] if b.get("extra") else [])
            for i, n in enumerate(buys):
                if i:
                    tk.Label(row, text="+", bg=c["bg"], fg=C["gold_d"], font=F(12)).pack(side="left", padx=px(4))
                icon(row, "item", n, 44 if i == 0 else 36, border=C["gold"] if ok else C["gold_d"], bg=c["bg"]).pack(side="left")
            tk.Label(c, text=" + ".join(buys), bg=c["bg"], fg=C["gold_l"], font=F(10, "semi"), justify="left",
                     anchor="w", wraplength=wrap(60)).pack(anchor="w", pady=(px(6), 0))
            if not ok:
                live["missing"] = tk.Label(c, text="", bg=c["bg"], fg=C["bad"], font=F(9, "bold"))
                live["missing"].pack(anchor="w")
            tg = tk.Frame(c, bg=c["bg"])
            tg.pack(fill="x", pady=(px(8), 0))
            icon(tg, "item", b["target"], 24, border=C["gold_d"], bg=c["bg"]).pack(side="left")
            tt = tk.Frame(tg, bg=c["bg"])
            tt.pack(side="left", padx=px(8), fill="x", expand=True)
            tk.Label(tt, text=("Completa " if b.get("complete") else "Hacia ") + b["target"], bg=c["bg"], fg=C["text"],
                     font=F(9, "bold"), anchor="w").pack(anchor="w")
            tk.Label(tt, text="Por qué: " + ingame.reason_text(b["target"], v), bg=c["bg"], fg=C["dim"], font=F(8),
                     justify="left", anchor="w", wraplength=wrap(100)).pack(anchor="w")
            for nx in b.get("also", []):
                tk.Label(tt, text=f"Con lo que sobra avanzás {nx}: {ingame.reason_text(nx, v)}", bg=c["bg"], fg=C["dim"],
                         font=F(8), justify="left", anchor="w", wraplength=wrap(100)).pack(anchor="w", pady=(px(3), 0))
        elif v["in_pool"]:
            caption(A, "Build completa. Si sobra oro: Control Ward y elixires.", C["good"], 9).pack(fill="x", padx=px(14), pady=(px(10), 0))

        if v["queue"][1:] and not compact:
            section(A, "Después")
            qr = tk.Frame(A, bg=C["bg"])
            qr.pack(fill="x", padx=px(14))
            for i, n in enumerate(v["queue"][1:]):
                if i:
                    tk.Label(qr, text="›", bg=C["bg"], fg=C["gold_d"], font=F(13)).pack(side="left", padx=px(3))
                icon(qr, "item", n, 32, border=C["gold_d"], tip_text=f"{n}\n{ingame.reason_text(n, v)}").pack(side="left")

        if v.get("rules_live"):
            section(A, "Tus reglas para ganar", "de tu historial")
            rc = card(A, top=0)
            for r in v["rules_live"]:
                rw = tk.Frame(rc, bg=rc["bg"])
                rw.pack(fill="x", pady=(0, px(5)))
                col = C["good"] if r["ok"] else C["bad"]
                tk.Label(rw, text="●", bg=rc["bg"], fg=col, font=F(9)).pack(side="left")
                tk.Label(rw, text=f" {r['rule']}", bg=rc["bg"], fg=C["text"], font=F(9, "bold")).pack(side="left")
                tk.Label(rw, text=r["value"], bg=rc["bg"], fg=col, font=F(10, "bold")).pack(side="right")
                caption(rc, f"{r['note']} · cumpliéndola ganás {r['wr_ok']}%, si no {r['wr_no']}%",
                        C["dim"], 8).pack(fill="x", pady=(0, px(4)))

        l = v["lane"]
        # guía de línea: arriba en la columna B mientras dura la fase de línea
        if l and v.get("guide") and v["time"] < 16 * 60:
            guide_card(B, v["guide"], l["champ"], my_level=me["level"])

        section(A, "Support rival" if v.get("support_mode") else "Tu rival")
        if l:
            c = card(A, top=0)
            r1 = tk.Frame(c, bg=c["bg"])
            r1.pack(fill="x")
            icon(r1, "champion", l["champ"], 40, border=C["muted"] if l["dead"] else C["bad"], bg=c["bg"]).pack(side="left")
            ri = tk.Frame(r1, bg=c["bg"])
            ri.pack(side="left", padx=px(10))
            tk.Label(ri, text=l["champ"] + ("  (muerto)" if l["dead"] else ""), bg=c["bg"], fg=C["gold_l"], font=F(11, "semi")).pack(anchor="w")
            dl = l["level"] - me["level"]
            lv = tk.Frame(ri, bg=c["bg"])
            lv.pack(anchor="w")
            tk.Label(lv, text=f"Nivel {l['level']}", bg=c["bg"], fg=C["bad"] if dl >= 1 else C["good"] if dl <= -1 else C["dim"],
                     font=F(9, "bold")).pack(side="left")
            tk.Label(lv, text=f" ({'+' if dl > 0 else ''}{dl} vs vos) · {l['kda']} · {l['cs']} CS", bg=c["bg"], fg=C["dim"], font=F(8)).pack(side="left")
            sp = tk.Frame(r1, bg=c["bg"])
            sp.pack(side="right")
            for s_ in l["spells"]:
                if s_:
                    icon(sp, "spell", s_, 22, border=C["gold_d"], bg=c["bg"], tip_text=s_.replace("Summoner", "")).pack(side="left", padx=1)
            if l["items"]:
                ir = tk.Frame(c, bg=c["bg"])
                ir.pack(anchor="w", pady=(px(8), 0))
                for n in l["items"]:
                    icon(ir, "item", n, 28, border=C["gold_d"], bg=c["bg"]).pack(side="left", padx=(0, px(3)))
            if l["ult"]:
                tk.Label(c, text=l["ult"], bg=c["bg"], fg=C["text"], font=F(8), justify="left", anchor="w",
                         wraplength=wrap(60)).pack(anchor="w", pady=(px(6), 0))
        else:
            caption(A, "No pude detectar a tu rival de línea.", C["dim"], 9).pack(fill="x", padx=px(14))
        ea = v.get("enemy_adc")
        if ea:
            c2 = card(A, top=4)
            r2 = tk.Frame(c2, bg=c2["bg"])
            r2.pack(fill="x")
            icon(r2, "champion", ea["champ"], 32, border=C["bad"], bg=c2["bg"]).pack(side="left")
            i2 = tk.Frame(r2, bg=c2["bg"])
            i2.pack(side="left", padx=px(10))
            tk.Label(i2, text=f"ADC rival: {ea['champ']}", bg=c2["bg"], fg=C["gold_l"], font=F(10, "semi")).pack(anchor="w")
            tk.Label(i2, text=f"Nivel {ea['level']} · {ea['kda']}", bg=c2["bg"], fg=C["dim"], font=F(8)).pack(anchor="w")
            if ea["items"]:
                ir2 = tk.Frame(c2, bg=c2["bg"])
                ir2.pack(anchor="w", pady=(px(6), 0))
                for n in ea["items"]:
                    icon(ir2, "item", n, 24, border=C["gold_d"], bg=c2["bg"]).pack(side="left", padx=(0, px(3)))
        if v.get("ally_adc") and v.get("support_mode"):
            caption(A, f"Tu ADC: {v['ally_adc']}", C["dim"], 8).pack(fill="x", padx=px(14), pady=(px(4), 0))

        if v["alerts"]:
            section(B, "Alertas")
            for tone, txt in v["alerts"]:
                a = tk.Frame(B, bg=C["card"])
                a.pack(fill="x", padx=px(14), pady=1)
                tk.Frame(a, bg=TONE.get(tone, C["gold"]), width=px(3)).pack(side="left", fill="y")
                tk.Label(a, text=txt, bg=C["card"], fg=C["text"], font=F(9), justify="left", anchor="w",
                         wraplength=wrap(50)).pack(side="left", padx=px(8), pady=px(5), fill="x")
        if compact:
            return
        section(B, "Equipo rival", f"AP {int(v['ap_share'] * 100)}% · AD {100 - int(v['ap_share'] * 100)}%")
        th = tk.Frame(B, bg=C["bg"])
        th.pack(fill="x", padx=px(14))
        for i, t in enumerate(v["threats"]):
            cell = tk.Frame(th, bg=C["bg"])
            cell.pack(side="left", padx=(0, px(8)))
            icon(cell, "champion", t["name"], 38 if i == 0 else 32, border=DMG[t["dmg"]],
                 tip_text=f"{t['name']} · nivel {t['level']} · {t['kda']}").pack()
            tk.Label(cell, text=t["kda"], bg=C["bg"], fg=C["bad"] if i == 0 else C["dim"], font=F(7, "bold" if i == 0 else "normal")).pack()
        bar(B, colw_px() - px(30), px(4), [(1 - v["ap_share"], C["ad"]), (v["ap_share"], C["ap"])]).pack(anchor="w", padx=px(14), pady=(px(4), 0))
        caption(B, "Ordenados por amenaza (oro en ítems + kills).", C["muted"], 7).pack(fill="x", padx=px(14), pady=(px(3), 0))
        section(B, "Objetivos", "aprox.")
        ob = tk.Frame(B, bg=C["bg"])
        ob.pack(fill="x", padx=px(14))
        live["objs"] = []
        for idx, (name, _) in enumerate(v["objectives"]):
            box = tk.Frame(ob, bg=C["card"], highlightthickness=1, highlightbackground=C["line"])
            box.pack(side="left", padx=(0, px(8)))
            tk.Label(box, text=name.upper(), bg=C["card"], fg=C["muted"], font=F(7, "bold")).pack(padx=px(12), pady=(px(5), 0))
            lb = tk.Label(box, text="", bg=C["card"], fg=C["gold_l"], font=F(12, "bold"))
            lb.pack(padx=px(12), pady=(0, px(5)))
            live["objs"].append((lb, idx))

    # ---------------- dibujar
    def draw_history(parent):
        h = getattr(engine, "history", None)
        s = h.summary if h else None
        if not s:
            if h and h.state in ("cargando", "pendiente"):
                caption(parent, "Cargando tu historial…", C["muted"]).pack(fill="x", padx=px(14))
            return
        tot = s["games"]
        wrt = 100 * s["wins"] / tot if tot else 0
        lr = s.get("last_review")
        if lr:
            section(parent, "Repaso de tu última partida", ("Victoria" if lr["win"] else "Derrota") + f" · {lr['champ']}")
            rc = card(parent, hi=not lr["win"], border=C["good"] if lr["win"] else C["bad"], top=0)
            tk.Label(rc, text=f"Cumpliste {lr['met']} de {lr['total']} de tus condiciones de victoria",
                     bg=rc["bg"], fg=C["gold_l"], font=F(10, "semi")).pack(anchor="w", pady=(0, px(6)))
            for it in lr["items"]:
                rw = tk.Frame(rc, bg=rc["bg"])
                rw.pack(fill="x", pady=(0, px(3)))
                tk.Label(rw, text="✓" if it["ok"] else "✗", bg=rc["bg"], fg=C["good"] if it["ok"] else C["bad"],
                         font=F(10, "bold")).pack(side="left")
                tk.Label(rw, text=f" {it['rule']}", bg=rc["bg"], fg=C["text"], font=F(9)).pack(side="left")
                tk.Label(rw, text=f"hiciste {it['value']}", bg=rc["bg"], fg=C["dim"], font=F(9)).pack(side="right")
            km = lr.get("key_miss")
            if km:
                caption(rc, f"Para la próxima: {km['rule']}. Cuando la cumplís ganás {km['wr_ok']:.0f}%, "
                            f"cuando no {km['wr_no']:.0f}%.", C["gold"], 9, True, 60).pack(fill="x", pady=(px(6), 0))
        if s.get("rules"):
            section(parent, "Tus condiciones de victoria", f"{s['rules_n']} partidas · {s['rules_role']}")
            box = tk.Frame(parent, bg=C["bg"])
            box.pack(fill="x", padx=px(14))
            for r in s["rules"]:
                rw = tk.Frame(box, bg=C["bg"])
                rw.pack(fill="x", pady=(0, px(2)))
                tk.Label(rw, text=wincons.rule_text(r), bg=C["bg"], fg=C["text"], font=F(9, "bold")).pack(side="left")
                if r["conf"] == "pista":
                    pill(rw, "PISTA", C["muted"], C["line"]).pack(side="left", padx=px(6))
                tk.Label(rw, text=f"{wincons.wr_of(r['ok']):.0f}% vs {wincons.wr_of(r['no']):.0f}%", bg=C["bg"],
                         fg=C["good"], font=F(9, "bold")).pack(side="right")
                caption(box, f"Cumpliéndola ganás {wincons.wr_of(r['ok']):.0f}% ({r['ok'][1]} partidas); "
                             f"si no, {wincons.wr_of(r['no']):.0f}% ({r['no'][1]})."
                             + (" Todavía sin confirmar." if r["conf"] == "pista" else ""), C["dim"], 8).pack(fill="x", pady=(0, px(5)))
        elif s["games"]:
            caption(parent, "Todavía no hay un patrón claro entre tus victorias y derrotas: con más partidas aparece.",
                    C["muted"]).pack(fill="x", padx=px(14), pady=(px(10), 0))
        section(parent, f"Tus últimas {tot} partidas", f"{s['wins']}-{tot - s['wins']} · {wrt:.0f}%")

        def line(par, name, g_, w_, kind=None, extra=""):
            rw = tk.Frame(par, bg=par["bg"])
            rw.pack(fill="x", pady=(0, px(4)))
            if kind:
                icon(rw, kind, name, 24, border=C["gold_d"], bg=par["bg"]).pack(side="left", padx=(0, px(8)))
            tk.Label(rw, text=name, bg=par["bg"], fg=C["text"], font=F(9)).pack(side="left")
            p = 100 * w_ / g_ if g_ else 0
            col = C["good"] if p >= 55 else C["bad"] if p <= 45 else C["neutral"]
            tk.Label(rw, text=f"{w_}-{g_ - w_}  {p:.0f}%{extra}", bg=par["bg"], fg=col, font=F(9, "bold")).pack(side="right")

        if s["mates"]:
            section(parent, "Con quién más jugaste", "mismo equipo")
            box = tk.Frame(parent, bg=C["bg"])
            box.pack(fill="x", padx=px(14))
            for m in s["mates"]:
                line(box, m["name"], m["g"], m["w"])
        if s["champs"]:
            section(parent, "Tus campeones")
            box = tk.Frame(parent, bg=C["bg"])
            box.pack(fill="x", padx=px(14))
            for c_ in s["champs"][:6]:
                kda = (c_["k"] + c_["a"]) / max(1, c_["d"])
                line(box, c_["key"], c_["g"], c_["w"], "champion", f" · KDA {kda:.1f}")
        if s["with_adc"]:
            section(parent, "De support, con cada ADC")
            box = tk.Frame(parent, bg=C["bg"])
            box.pack(fill="x", padx=px(14))
            for a in s["with_adc"][:6]:
                line(box, a["key"], a["g"], a["w"], "champion")

    def draw(view, status):
        hide_tip()
        waiting.clear()
        live.clear()
        body = tk.Frame(sc, bg=C["bg"])
        kind, msg = status
        set_status(kind, msg)
        game = view is not None and "gold" in view
        if game:
            draw_game_header(body, view)
        if view is None:
            box = tk.Frame(body, bg=C["bg"])
            box.pack(fill="x", padx=px(14), pady=px(18))
            tk.Label(box, text="◆", bg=C["bg"], fg=C["gold_d"], font=F(22)).pack()
            tk.Label(box, text={"idle": "Listo", "search": "Buscando..."}.get(kind, "Sin conexión"), bg=C["bg"],
                     fg=C["gold_l"], font=F(13, "semi")).pack(pady=(px(4), px(2)))
            tk.Label(box, text="Entrá a champ select y aparece la recomendación." if kind == "idle"
                     else "Abrí el cliente de League para conectar.", bg=C["bg"], fg=C["dim"], font=F(9),
                     wraplength=wrap()).pack()
            if kind in ("idle", "live"):
                draw_history(body)
        else:
            grid = tk.Frame(body, bg=C["bg"])
            grid.pack(fill="both", expand=True)
            if st["cols"] == 2:
                ca = tk.Frame(grid, bg=C["bg"])
                cb = tk.Frame(grid, bg=C["bg"])
                ca.grid(row=0, column=0, sticky="nsew")
                cb.grid(row=0, column=1, sticky="nsew")
                grid.columnconfigure(0, weight=1, uniform="c")
                grid.columnconfigure(1, weight=1, uniform="c")
                cols = [ca, cb]
            else:
                one = tk.Frame(grid, bg=C["bg"])
                one.pack(fill="both", expand=True)
                cols = [one]
            if game:
                draw_game(cols, view)
            else:
                draw_select(cols, view)
        foot = tk.Frame(body, bg=C["bg"])
        foot.pack(fill="x", padx=px(14), pady=(px(12), px(14)))
        tk.Frame(foot, bg=C["line"], height=1).pack(fill="x", pady=(0, px(6)))
        tk.Label(foot, text=engine.meta if not game else "Datos en vivo del juego", bg=C["bg"], fg=C["muted"],
                 font=F(7)).pack(side="left")
        tk.Label(foot, text="— compacto · ▢ pantalla completa · ◢ tamaño", bg=C["bg"], fg=C["muted"],
                 font=F(7)).pack(side="right")
        old = cur["body"]
        sc.itemconfigure(sc_win, window=body, width=root.winfo_width() - 2)
        cur["body"] = body
        old.destroy()
        if game:
            update_live(view)

    def refresh():
        with engine.lock:
            view, status = engine.view, engine.status
        game = view is not None and "gold" in view
        hv = getattr(getattr(engine, "history", None), "version", 0)
        sig = (status, game_sig(view) if game else render_text(view), st["compact"], st["cols"], round(st["U"], 2), st["w"], hv)
        if sig != st["sig"]:
            st["sig"], st["dirty"] = sig, False
            draw(view, status)
            root.update_idletasks()
            bh = cur["body"].winfo_reqheight()
            sc.configure(scrollregion=(0, 0, root.winfo_width(), bh))
            if not st["manual"]:
                x, y, w, h = _work_area(root)
                want = header.winfo_reqheight() + 3 + bh
                hh = min(want, h - int(40 * K))
                if hh != st["h_auto"]:
                    st["h_auto"] = hh
                    root.geometry(f"{root.winfo_width()}x{hh}")
        else:
            if game:
                update_live(view)
            if st["dirty"] and waiting:
                st["dirty"] = False
                fill_waiting()
        root.after(400, refresh)

    def prefetch():
        while not engine.dd_loaded:
            time.sleep(0.2)
        names = set()
        for c in engine.pool:
            names.add(("champion", c["name"]))
            for it in c["start"] + [c["boots"]]:
                names.add(("item", it))
            for b in c["builds"].values():
                names.update(("item", it) for it in b["items"] + ([b["boots"]] if b.get("boots") else []))
            r = c["runes"]
            names.update(("rune", n) for n in [r["keystone"]] + r["primary"] + r["secondary"])
            names.update(("spell", n) for n in c["spells"])
            for mname, m in sorted(c["matchups"].items(), key=lambda x: -x[1].get("games", 0))[:25]:
                names.add(("champion", mname))
                for it in m.get("start", []) + m.get("first", []) + ([m["boots"]] if m.get("boots") else []):
                    names.add(("item", it))
                pr = m.get("pro")
                if pr:
                    names.update([("item", pr["start"]), ("rune", pr["keystone"])])
                    if pr.get("rush"):
                        names.add(("item", pr["rush"]))
                    if pr.get("spell"):
                        names.add(("spell", pr["spell"]))
        for kind, n in names:
            engine.dd.request(kind, n)

    for a in sys.argv:
        if a.startswith("--size="):
            try:
                w_, h_ = a.split("=", 1)[1].lower().split("x")
                root.geometry(f"{int(w_)}x{int(h_)}")
                st["manual"] = True
            except ValueError:
                pass
    relayout()
    threading.Thread(target=engine.run_forever, daemon=True).start()
    threading.Thread(target=prefetch, daemon=True).start()
    refresh()
    root.mainloop()
