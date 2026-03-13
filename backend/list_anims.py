import sys
import struct
import json

def list_animations(filepath):
    with open(filepath, 'rb') as f:
        magic = f.read(4)
        if magic != b'glTF':
            print("Not a glTF file")
            return
        version, length = struct.unpack('<II', f.read(8))
        json_len, chunk_type = struct.unpack('<II', f.read(8))
        if chunk_type != 0x4E4F534A: # 'JSON'
            print("First chunk is not JSON")
            return
        json_data = f.read(json_len)
        gltf = json.loads(json_data.decode('utf-8'))
        animations = gltf.get("animations", [])
        for i, a in enumerate(animations):
            print(f"[{i}] {a.get('name', 'Unnamed')}")

if __name__ == '__main__':
    list_animations(sys.argv[1])
