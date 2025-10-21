import os, json, struct, math
from PIL import Image, ImageDraw, ImageFilter

# === OUTPUT DIRECTORY ===
OUT_DIR = "space_glider_v4"
os.makedirs(OUT_DIR, exist_ok=True)

# === GEOMETRY HELPERS ===
def ellipsoid(rx, ry, rz, seg_u=48, seg_v=24):
    pos=[]; idx=[]
    for v in range(seg_v+1):
        phi=math.pi*v/seg_v
        for u in range(seg_u+1):
            theta=2*math.pi*u/seg_u
            x=math.sin(phi)*math.cos(theta)
            y=math.cos(phi)
            z=math.sin(phi)*math.sin(theta)
            pos += [rx*x, ry*y, rz*z]
    for v in range(seg_v):
        for u in range(seg_u):
            a=v*(seg_u+1)+u
            b=a+seg_u+1
            idx += [a,b,a+1,b,b+1,a+1]
    return pos, idx

def cylinder(radius=0.35,length=0.9,seg=32):
    pos=[]; idx=[]; h=length/2
    for i in range(seg+1):
        t=2*math.pi*i/seg; x=math.cos(t); y=math.sin(t)
        for z in (-h,h):
            pos += [radius*x, radius*y, z]
    for i in range(seg):
        a=2*i; b=a+1; c=a+2; d=a+3
        idx += [a,b,c,b,d,c]
    # simple caps
    base_center = len(pos)//3
    pos += [0,0,-h]
    for i in range(seg):
        t1=2*math.pi*i/seg; t2=2*math.pi*(i+1)/seg
        pos += [radius*math.cos(t1), radius*math.sin(t1), -h]
        pos += [radius*math.cos(t2), radius*math.sin(t2), -h]
        n=len(pos)//3
        idx += [base_center, n-2, n-1]
    top_center = len(pos)//3
    pos += [0,0,h]
    for i in range(seg):
        t1=2*math.pi*i/seg; t2=2*math.pi*(i+1)/seg
        pos += [radius*math.cos(t1), radius*math.sin(t1), h]
        pos += [radius*math.cos(t2), radius*math.sin(t2), h]
        n=len(pos)//3
        idx += [top_center, n-1, n-2]
    return pos, idx

def wing(sign=1,thick=0.05):
    span,root,tip,sweep=4.0,1.6,0.8,0.6; z0=-0.3
    base=[0,-thick/2,z0,
          sign*span,-thick/2,z0-sweep,
          sign*span,-thick/2,z0-sweep+tip,
          0,-thick/2,z0+root]
    top=base[:]
    top[1]=thick/2; top[4]=thick/2; top[7]=thick/2; top[10]=thick/2
    v=base+top
    f=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,
       1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]
    return v,f


# --- correct thruster geometry ---
def make_thruster(radius=0.35, length=0.9, seg=32):
    """Closed cylinder oriented along Z, normals facing outward."""
    pos=[]; idx=[]
    h = length / 2
    # side vertices
    for i in range(seg):
        theta = 2 * math.pi * i / seg
        x = radius * math.cos(theta)
        y = radius * math.sin(theta)
        pos += [x, y, -h, x, y, h]
    # side faces
    for i in range(seg):
        a = 2 * i
        b = (2 * ((i + 1) % seg))
        idx += [a, b, a + 1, b, b + 1, a + 1]
    # caps
    base_center = len(pos) // 3
    pos += [0, 0, -h]
    for i in range(seg):
        t1 = 2 * math.pi * i / seg
        t2 = 2 * math.pi * (i + 1) / seg
        pos += [radius * math.cos(t1), radius * math.sin(t1), -h]
        pos += [radius * math.cos(t2), radius * math.sin(t2), -h]
        n = len(pos) // 3
        idx += [base_center, n - 2, n - 1]
    top_center = len(pos) // 3
    pos += [0, 0, h]
    for i in range(seg):
        t1 = 2 * math.pi * i / seg
        t2 = 2 * math.pi * (i + 1) / seg
        pos += [radius * math.cos(t1), radius * math.sin(t1), h]
        pos += [radius * math.cos(t2), radius * math.sin(t2), h]
        n = len(pos) // 3
        idx += [top_center, n - 1, n - 2]
    return pos, idx



# === BUILD PARTS ===
f_pos, f_idx = ellipsoid(0.8,0.6,2.5)
wR_pos, wR_idx = wing( 1)
wL_pos, wL_idx = wing(-1)

# replace your old `cylinder()` calls
t_pos, t_idx = make_thruster()

parts = [
    ("Fuselage", f_pos, f_idx, "Hull"),
    ("WingRight", wR_pos, wR_idx, "Hull"),
    ("WingLeft", wL_pos, wL_idx, "Hull"),
    ("ThrusterLeft",  [x-0.7 if i%3==0 else x for i,x in enumerate(t_pos)], t_idx, "ThrusterLeftMat"),
    ("ThrusterRight", [x+0.7 if i%3==0 else x for i,x in enumerate(t_pos)], t_idx, "ThrusterRightMat"),
]


# === TEXTURES ===
def save_png(img, name):
    path=os.path.join(OUT_DIR,name); img.save(path,"PNG"); return name

def base_color():
    W=H=1024
    img = Image.new("RGBA",(W,H),(215,220,230,255))
    d = ImageDraw.Draw(img)
    for step in (64,96,128):
        for x in range(0,W,step):
            d.line([(x,0),(x,H)], fill=(185,190,200,255))
        for y in range(0,H,step):
            d.line([(0,y),(W,y)], fill=(185,190,200,255))
    return img.filter(ImageFilter.GaussianBlur(0.5))

save_png(base_color(), "baseColor.png")
Image.new("RGB",(1024,1024),(0,90,220)).save(os.path.join(OUT_DIR,"metallicRoughness.png"))
Image.new("RGB",(1024,1024),(128,128,255)).save(os.path.join(OUT_DIR,"normal.png"))
Image.new("RGB",(1024,1024),(0,0,0)).save(os.path.join(OUT_DIR,"emissive.png"))

Image.new("RGBA",(512,512),(190,195,205,255)).save(os.path.join(OUT_DIR,"thruster_baseColor.png"))
Image.new("RGB",(512,512),(0,90,200)).save(os.path.join(OUT_DIR,"thruster_metallicRoughness.png"))
Image.new("RGB",(512,512),(128,128,255)).save(os.path.join(OUT_DIR,"thruster_normal.png"))
Image.new("RGB",(512,512),(0,0,0)).save(os.path.join(OUT_DIR,"thruster_emissive.png"))

# === BUILD GLTF STRUCTURE ===
bin_data=bytearray()
bufferViews=[]; accessors=[]; meshes=[]; nodes=[]

def align4(n): return (4-(n%4))%4

def add_mesh(name, pos, idx, mat_index):
    pos_bytes=struct.pack("<%sf"%len(pos),*pos)
    p_off=len(bin_data); bin_data.extend(pos_bytes); bin_data.extend(b"\x00"*align4(len(bin_data)))
    bv_pos=len(bufferViews); bufferViews.append({"buffer":0,"byteOffset":p_off,"byteLength":len(pos_bytes),"target":34962})
    xs=pos[0::3]; ys=pos[1::3]; zs=pos[2::3]
    acc_pos=len(accessors)
    accessors.append({"bufferView":bv_pos,"componentType":5126,"count":len(pos)//3,"type":"VEC3","min":[min(xs),min(ys),min(zs)],"max":[max(xs),max(ys),max(zs)]})
    idx_bytes=struct.pack("<%sH"%len(idx),*idx)
    i_off=len(bin_data); bin_data.extend(idx_bytes); bin_data.extend(b"\x00"*align4(len(bin_data)))
    bv_idx=len(bufferViews); bufferViews.append({"buffer":0,"byteOffset":i_off,"byteLength":len(idx_bytes),"target":34963})
    acc_idx=len(accessors); accessors.append({"bufferView":bv_idx,"componentType":5123,"count":len(idx),"type":"SCALAR"})
    meshes.append({"name":name,"primitives":[{"attributes":{"POSITION":acc_pos},"indices":acc_idx,"material":mat_index}]})
    nodes.append({"name":name,"mesh":len(meshes)-1})

# Materials
materials = [
    {
        "name": "Hull",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "metallicRoughnessTexture": {"index": 1},
        },
        "normalTexture": {"index": 2},
        "emissiveTexture": {"index": 3},
        "emissiveFactor": [0, 0, 0],
        "doubleSided": True,
    },
    {
        "name": "ThrusterLeftMat",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 4},
            "metallicRoughnessTexture": {"index": 5},
        },
        "normalTexture": {"index": 6},
        "emissiveTexture": {"index": 7},
        "emissiveFactor": [0.05, 0.2, 0.6],  # faint blue glow by default
        "doubleSided": True,
    },
    {
        "name": "ThrusterRightMat",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 4},
            "metallicRoughnessTexture": {"index": 5},
        },
        "normalTexture": {"index": 6},
        "emissiveTexture": {"index": 7},
        "emissiveFactor": [0.05, 0.2, 0.6],
        "doubleSided": True,
    },
]


textures=[
    {"source":0},{"source":1},{"source":2},{"source":3},
    {"source":4},{"source":5},{"source":6},{"source":7}
]
images=[
    {"uri":"baseColor.png"},{"uri":"metallicRoughness.png"},{"uri":"normal.png"},{"uri":"emissive.png"},
    {"uri":"thruster_baseColor.png"},{"uri":"thruster_metallicRoughness.png"},{"uri":"thruster_normal.png"},{"uri":"thruster_emissive.png"}
]

for nm,pos,ind,mat in parts:
    if nm == "ThrusterLeft": m_idx = 1
    elif nm == "ThrusterRight": m_idx = 2
    else: m_idx = 0
    add_mesh(nm,pos,ind,m_idx)

root_index=len(nodes)
nodes.append({"name":"SpaceGlider","children":list(range(root_index))})

gltf={
    "asset":{"version":"2.0","generator":"space_glider_v4"},
    "scenes":[{"nodes":[root_index]}],
    "scene":0,
    "nodes":nodes,
    "meshes":meshes,
    "materials":materials,
    "textures":textures,
    "images":images,
    "buffers":[{"uri":"space_glider_v4.bin","byteLength":len(bin_data)}],
    "bufferViews":bufferViews,
    "accessors":accessors
}

with open(os.path.join(OUT_DIR,"space_glider_v4.bin"),"wb") as f: f.write(bin_data)
with open(os.path.join(OUT_DIR,"space_glider_v4.gltf"),"w") as f: json.dump(gltf,f,indent=2)


# remove .bin uri for embedded buffer
gltf["buffers"][0].pop("uri", None)
json_str = json.dumps(gltf,separators=(',',':'))
def pad4(b): return b + b' ' * ((4 - (len(b)%4)) % 4)
json_bytes = pad4(json_str.encode("utf8"))
bin_padded = pad4(bin_data)
length = 12 + 8 + len(json_bytes) + 8 + len(bin_padded)

out = os.path.join(OUT_DIR,"space_glider_v4.glb")
with open(out,"wb") as f:
    f.write(struct.pack("<4sII",b'glTF',2,length))
    f.write(struct.pack("<I4s",len(json_bytes),b'JSON')); f.write(json_bytes)
    f.write(struct.pack("<I4s",len(bin_padded),b'BIN\x00')); f.write(bin_padded)

print("✅ Wrote", out)


print("✅ Created space_glider_v4.gltf with visible thrusters and PBR textures in", OUT_DIR)
