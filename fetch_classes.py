#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.parse
import urllib.request

DAY_MAP = {
    "ISN": "Monday",
    "SEL": "Tuesday",
    "RAB": "Wednesday",
    "KHA": "Thursday",
    "JUM": "Friday",
    "SAB": "Saturday",
    "AHD": "Sunday",
}

URL = "https://app.mypolycc.edu.my/polycctas/service/kelas/data/viewjadual.php"


def post_form(data: dict):
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        URL,
        data=encoded,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json, text/plain, */*",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def fetch_all_classes(agc: str, sesi: str, dep: str, mode: str):
    payload = {
        "DEP": dep,
        "SES": sesi,
        "mode": mode,
        "uag": agc,
        "rt": "1",
        "dep": dep,
        "getall": "1",
    }
    return post_form(payload)


def fetch_class_schedule(agc: str, sesi: str, dep: str, mode: str, clss: str):
    payload = {
        "DEP": dep,
        "SES": sesi,
        "mode": mode,
        "uag": agc,
        "rt": "2",
        "CLSS": clss,
    }
    return post_form(payload)


def decode_display_cells(data: dict):
    schedule_format = data.get("format", {})
    row_titles = [item.strip() for item in schedule_format.get("RowTitle", "").split(",") if item.strip()]
    col_titles = [item.strip() for item in schedule_format.get("ColTitle", "").split(",") if item.strip()]
    display = data.get("display", {})
    decoded = []

    if not row_titles or not col_titles:
        return decoded

    slots_per_day = len(col_titles)
    for cell_key, entry in sorted(display.items(), key=lambda item: int(item[0])):
        cell_no = int(cell_key)
        day_index = (cell_no - 1) // slots_per_day
        time_index = (cell_no - 1) % slots_per_day
        day_code = row_titles[day_index] if day_index < len(row_titles) else row_titles[-1]
        decoded.append(
            {
                "cell": cell_no,
                "day_code": day_code,
                "day": DAY_MAP.get(day_code, day_code),
                "time": col_titles[time_index],
                "subject": entry.get("SBJ"),
                "lecturer": entry.get("LecturerName"),
                "nickname": entry.get("NickName"),
                "venue": entry.get("VEN"),
                "raw": entry,
            }
        )

    return decoded


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--agc", default="17")
    parser.add_argument("--sesi", default="20261")
    parser.add_argument("--dep", default="JTMK")
    parser.add_argument("--mode", default="2")
    parser.add_argument("--class")
    parser.add_argument("--decode", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        if args.__dict__["class"]:
            data = fetch_class_schedule(args.agc, args.sesi, args.dep, args.mode, args.__dict__["class"])
            if args.decode:
                decoded = decode_display_cells(data)
                if args.json:
                    json.dump(decoded, sys.stdout, indent=2, ensure_ascii=False)
                    print()
                    return
                for item in decoded:
                    print(
                        f"cell={item['cell']}\t{item['day']}\t{item['time']}\t{item['subject']}\t{item['nickname']}\t{item['venue']}"
                    )
                return
            if args.json:
                json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
                print()
                return
            print(f"class={args.__dict__['class']}")
            print(f"assignments={len(data.get('assign', {}))}")
            print(f"display_cells={len(data.get('display', {}))}")
            return

        data = fetch_all_classes(args.agc, args.sesi, args.dep, args.mode)
        classes = data.get("arData", [])
        if args.json:
            json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
            print()
            return
        for item in classes:
            if isinstance(item, list) and len(item) >= 2:
                print(f"{item[0]}\t{item[1]}")
            else:
                print(item)
        print(f"total={len(classes)}", file=sys.stderr)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
