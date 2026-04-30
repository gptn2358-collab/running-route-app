"""
V2X 교차로 MAP CSV → JSON 변환 스크립트

사용법:
  1. t-data.seoul.go.kr/dataprovide/trafficdataviewfile.do?data_id=10144
     에서 CSV 파일 다운로드
  2. 이 스크립트와 같은 폴더에 CSV 파일 복사
  3. python scripts/csv_to_json.py
  4. 생성된 assets/intersectionCoords.json 확인
"""

import csv
import json
import glob
import os
import sys

def main():
    # CSV 파일 탐색
    csv_files = glob.glob("scripts/v2xCrossroad*.csv") + \
                glob.glob("v2xCrossroad*.csv") + \
                glob.glob("scripts/*.csv")

    if not csv_files:
        print("ERROR: CSV 파일을 찾을 수 없습니다.")
        print("  v2xCrossroadMapInformation_*.csv 파일을 scripts/ 폴더에 넣어주세요.")
        sys.exit(1)

    csv_path = csv_files[0]
    print(f"CSV 파일 발견: {csv_path}")

    records = []
    encodings = ["utf-8-sig", "cp949", "euc-kr", "utf-8"]

    for enc in encodings:
        try:
            with open(csv_path, encoding=enc, newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        itst_id = str(row.get("itstId", row.get("ITST_ID", "")).strip())
                        itst_nm = row.get("itstNm", row.get("ITST_NM", "")).strip()
                        lat_raw = row.get("mapCtptIntLat", row.get("MAP_CTPT_INT_LAT", "")).strip()
                        lon_raw = row.get("mapCtptIntLot", row.get("MAP_CTPT_INT_LOT", "")).strip()

                        if not itst_id or not lat_raw or not lon_raw:
                            continue

                        lat = float(lat_raw)
                        lon = float(lon_raw)

                        # 서울 좌표 범위 검증 (위도 37.4~37.7, 경도 126.7~127.2)
                        if not (37.4 <= lat <= 37.7 and 126.7 <= lon <= 127.2):
                            continue

                        records.append({
                            "itstId": itst_id,
                            "itstNm": itst_nm,
                            "mapCtptIntLat": lat,
                            "mapCtptIntLot": lon,
                        })
                    except (ValueError, KeyError):
                        continue
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if not records:
        print("ERROR: 유효한 데이터를 파싱하지 못했습니다. CSV 컬럼명을 확인하세요.")
        sys.exit(1)

    out_path = os.path.join("assets", "intersectionCoords.json")
    os.makedirs("assets", exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"✅ 변환 완료: {len(records)}개 교차로 → {out_path}")
    print(f"   예시: {records[0] if records else 'N/A'}")

if __name__ == "__main__":
    main()
