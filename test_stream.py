import os
import requests
import json
import time

def test_stream():
    url_login = "http://127.0.0.1:8000/api/auth/login/"
    resp = requests.post(url_login, json={"username": "admin", "password": "123"})
    if resp.status_code != 200:
        print("Login failed", resp.text)
        return
    token = resp.json().get("tokens", {}).get("access")
    if not token:
        print("No token found in response", resp.json())
        return
    print(f"Token: {token[:20]}...")
    
    url_import = "http://127.0.0.1:8000/api/inventory/items/import_excel/"
    headers = {"Authorization": f"Bearer {token}"}
    
    file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Data.xlsx')
    print(f"Uploading {file_path}")
    with open(file_path, "rb") as f:
        files = {"file": f}
        data = {"warehouse_id": 1, "conflict_strategy": "ignore"}
        
        print("Sending request...")
        start_time = time.time()
        with requests.post(url_import, headers=headers, files=files, data=data, stream=True) as r:
            print(f"Response status: {r.status_code}")
            for line in r.iter_lines():
                if line:
                    print(f"[{time.time() - start_time:.2f}s] {line.decode('utf-8')[:80]}")
                    
if __name__ == "__main__":
    test_stream()
