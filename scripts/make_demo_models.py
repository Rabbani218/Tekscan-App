"""Generator Model Demo ONNX untuk TEKSCAN (tanpa PyTorch, hanya onnx + numpy).

Menghasilkan model ONNX tiruan yang 100% mematuhi kontrak docs/MODEL_CONTRACT.md:
- YOLO11 demo: input [1, 3, 640, 640] float32, output [1, 10, 8400] float32
  memuat 4 kotak teruji: 2 kotak tumpang tindih untuk menguji NMS, skor 0.92, 0.70, 0.40.
- ResNet50 demo: input [1, 3, 224, 224] float32, output [1, 6] float32 logits.
- Varian demo_case: defect, uncertain, clean untuk validasi 3 tingkat status.
- class_names.json dan preprocessing_config.json.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
import numpy as np
import onnx
from onnx import helper, TensorProto, checker
import onnxruntime as ort

CLASS_NAMES = ["defect_free", "hole", "lines", "stain", "horizontal", "vertical"]
NC = len(CLASS_NAMES)
NUM_ANCHORS = 8400  # standar YOLO 640x640


def create_yolo_onnx(output_path: Path, case: str = "defect") -> None:
    # 1. Definisikan input node
    input_info = helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 640, 640])
    output_info = helper.make_tensor_value_info("output0", TensorProto.FLOAT, [1, 4 + NC, NUM_ANCHORS])

    # 2. Siapkan data tensor konstanta (4 + NC, NUM_ANCHORS)
    data = np.zeros((4 + NC, NUM_ANCHORS), dtype=np.float32)

    if case == "defect":
        # Box 1: hole (class 1), cx=200, cy=200, w=100, h=100, score=0.92
        data[0, 100] = 200.0
        data[1, 100] = 200.0
        data[2, 100] = 100.0
        data[3, 100] = 100.0
        data[4 + 1, 100] = 0.92

        # Box 2: hole (class 1), cx=204, cy=204, w=98, h=102, score=0.75 (Tumpang tindih tinggi dgn Box 1 -> harus dieliminasi oleh NMS)
        data[0, 101] = 204.0
        data[1, 101] = 204.0
        data[2, 101] = 98.0
        data[3, 101] = 102.0
        data[4 + 1, 101] = 0.75

        # Box 3: lines (class 2), cx=450, cy=350, w=120, h=80, score=0.70 (Kelas beda & lokasi beda -> lolos NMS)
        data[0, 500] = 450.0
        data[1, 500] = 350.0
        data[2, 500] = 120.0
        data[3, 500] = 80.0
        data[4 + 2, 500] = 0.70

        # Box 4: stain (class 3), cx=100, cy=400, w=60, h=60, score=0.40 (Skor 0.25 - 0.50 -> verifikasi)
        data[0, 800] = 100.0
        data[1, 800] = 400.0
        data[2, 800] = 60.0
        data[3, 800] = 60.0
        data[4 + 3, 800] = 0.40

    elif case == "uncertain":
        # Hanya kotak dengan skor di antara 0.25 dan 0.45 (memicu PERLU VERIFIKASI MANUAL)
        data[0, 200] = 320.0
        data[1, 200] = 320.0
        data[2, 200] = 80.0
        data[3, 200] = 80.0
        data[4 + 1, 200] = 0.38  # class hole

    elif case == "clean":
        # Skor maksimal di bawah 0.25 -> diabaikan oleh threshold conf -> 0 deteksi -> TIDAK ADA CACAT
        data[0, 200] = 320.0
        data[1, 200] = 320.0
        data[2, 200] = 80.0
        data[3, 200] = 80.0
        data[4 + 1, 200] = 0.10

    # Expand dims ke [1, 4+NC, NUM_ANCHORS]
    data_3d = data[np.newaxis, :, :]

    const_tensor = helper.make_tensor(
        name="const_output_data",
        data_type=TensorProto.FLOAT,
        dims=[1, 4 + NC, NUM_ANCHORS],
        vals=data_3d.flatten().tolist(),
    )
    const_node = helper.make_node("Constant", inputs=[], outputs=["const_out"], value=const_tensor)

    # 3. Hubungkan input ke output (Mul 0.0 -> ReduceSum -> Add ke const_out)
    zero_val = helper.make_tensor(name="zero_const", data_type=TensorProto.FLOAT, dims=[1], vals=[0.0])
    zero_node = helper.make_node("Constant", inputs=[], outputs=["zero_scalar"], value=zero_val)
    mul_node = helper.make_node("Mul", inputs=["images", "zero_scalar"], outputs=["input_zeroed"])
    sum_node = helper.make_node("ReduceSum", inputs=["input_zeroed"], outputs=["scalar_zero"], keepdims=0)
    add_node = helper.make_node("Add", inputs=["const_out", "scalar_zero"], outputs=["output0"])

    graph = helper.make_graph(
        nodes=[const_node, zero_node, mul_node, sum_node, add_node],
        name=f"tekscan_yolo11_demo_{case}",
        inputs=[input_info],
        outputs=[output_info],
    )

    # Metadata names dict sesuai format ultralytics
    names_dict = {i: name for i, name in enumerate(CLASS_NAMES)}
    meta = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=10)
    entry = meta.metadata_props.add()
    entry.key = "names"
    entry.value = str(names_dict)

    checker.check_model(meta)
    onnx.save(meta, str(output_path))


def create_resnet_onnx(output_path: Path, case: str = "defect") -> None:
    input_info = helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, 224, 224])
    output_info = helper.make_tensor_value_info("logits", TensorProto.FLOAT, [1, NC])

    logits = np.zeros((1, NC), dtype=np.float32)
    if case == "defect":
        logits[0, 1] = 8.0  # class 1 (hole) mendominasi -> softmax > 0.99
    elif case == "clean":
        logits[0, 0] = 8.0  # class 0 (defect_free) mendominasi -> softmax > 0.99
    elif case == "uncertain":
        logits[0, :] = 1.0  # semua sama rata -> probabilitas masing-masing ~ 0.166 (< 0.50)

    const_tensor = helper.make_tensor(
        name="const_logits_data",
        data_type=TensorProto.FLOAT,
        dims=[1, NC],
        vals=logits.flatten().tolist(),
    )
    const_node = helper.make_node("Constant", inputs=[], outputs=["const_out"], value=const_tensor)

    zero_val = helper.make_tensor(name="zero_const", data_type=TensorProto.FLOAT, dims=[1], vals=[0.0])
    zero_node = helper.make_node("Constant", inputs=[], outputs=["zero_scalar"], value=zero_val)
    mul_node = helper.make_node("Mul", inputs=["input", "zero_scalar"], outputs=["input_zeroed"])
    sum_node = helper.make_node("ReduceSum", inputs=["input_zeroed"], outputs=["scalar_zero"], keepdims=0)
    add_node = helper.make_node("Add", inputs=["const_out", "scalar_zero"], outputs=["logits"])

    graph = helper.make_graph(
        nodes=[const_node, zero_node, mul_node, sum_node, add_node],
        name=f"tekscan_resnet50_demo_{case}",
        inputs=[input_info],
        outputs=[output_info],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=10)
    checker.check_model(model)
    onnx.save(model, str(output_path))


def generate_all_demo_models(target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)

    # 1. Buat model YOLO default (defect) dan variasi status
    yolo_default = target_dir / "tekscan_yolo_demo.onnx"
    create_yolo_onnx(yolo_default, case="defect")
    create_yolo_onnx(target_dir / "tekscan_yolo_demo_defect.onnx", case="defect")
    create_yolo_onnx(target_dir / "tekscan_yolo_demo_uncertain.onnx", case="uncertain")
    create_yolo_onnx(target_dir / "tekscan_yolo_demo_clean.onnx", case="clean")

    # 2. Buat model ResNet50 default (defect) dan variasi status
    resnet_default = target_dir / "resnet50_demo.onnx"
    create_resnet_onnx(resnet_default, case="defect")
    create_resnet_onnx(target_dir / "resnet50_demo_defect.onnx", case="defect")
    create_resnet_onnx(target_dir / "resnet50_demo_uncertain.onnx", case="uncertain")
    create_resnet_onnx(target_dir / "resnet50_demo_clean.onnx", case="clean")

    # 3. Konfigurasi preprocessing_config.json dan class_names.json
    config_data = {
        "schema_version": 2,
        "yolo": {
            "file": "tekscan_yolo_demo.onnx",
            "imgsz": [640, 640],
            "input_range": "0-1",
            "channel_order": "RGB",
            "layout": "NCHW",
            "letterbox_pad_value": 114,
            "conf_threshold": 0.25,
            "iou_threshold": 0.5,
            "max_det": 300,
        },
        "resnet50": {
            "file": "resnet50_demo.onnx",
            "input_size": [224, 224],
            "channel_order": "RGB",
            "layout": "NCHW",
            "resize": {
                "mode": "resize_shorter_center_crop",
                "shorter": 256,
            },
            "interpolation": "bilinear",
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
            "output": "logits",
        },
        "status": {
            "defect_threshold": 0.5,
            "verify_threshold": 0.25,
            "clean_class": "defect_free",
        },
    }

    names_data = {
        "yolo": CLASS_NAMES,
        "resnet50": CLASS_NAMES,
    }

    (target_dir / "preprocessing_config.json").write_text(json.dumps(config_data, indent=2), encoding="utf-8")
    (target_dir / "class_names.json").write_text(json.dumps(names_data, indent=2), encoding="utf-8")

    # 4. Buat subfolder case_defect, case_uncertain, case_clean mandiri
    for c in ("defect", "uncertain", "clean"):
        c_dir = target_dir / f"case_{c}"
        c_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(target_dir / f"tekscan_yolo_demo_{c}.onnx", c_dir / "tekscan_yolo_demo.onnx")
        shutil.copyfile(target_dir / f"resnet50_demo_{c}.onnx", c_dir / "resnet50_demo.onnx")
        (c_dir / "preprocessing_config.json").write_text(json.dumps(config_data, indent=2), encoding="utf-8")
        (c_dir / "class_names.json").write_text(json.dumps(names_data, indent=2), encoding="utf-8")

    print(f"[OK] Berkas model demo, kasus uji, dan konfigurasi berhasil dibuat di {target_dir}")


def validate_with_ort(target_dir: Path) -> None:
    print("\n--- Validasi OnnxRuntime Inferensi Nyata ---")
    yolo_file = str(target_dir / "tekscan_yolo_demo.onnx")
    sess_yolo = ort.InferenceSession(yolo_file, providers=["CPUExecutionProvider"])
    inp_yolo = sess_yolo.get_inputs()[0]
    out_yolo = sess_yolo.get_outputs()[0]
    print(f"YOLO11 ONNX Input: name={inp_yolo.name}, shape={inp_yolo.shape}, dtype={inp_yolo.type}")
    print(f"YOLO11 ONNX Output: name={out_yolo.name}, shape={out_yolo.shape}, dtype={out_yolo.type}")

    dummy_yolo_in = np.ones((1, 3, 640, 640), dtype=np.float32)
    yolo_res = sess_yolo.run(None, {inp_yolo.name: dummy_yolo_in})[0]
    print(f"YOLO11 ONNX Inferensi berhasil: shape output={yolo_res.shape}, max_val={yolo_res.max():.4f}")

    resnet_file = str(target_dir / "resnet50_demo.onnx")
    sess_resnet = ort.InferenceSession(resnet_file, providers=["CPUExecutionProvider"])
    inp_res = sess_resnet.get_inputs()[0]
    out_res = sess_resnet.get_outputs()[0]
    print(f"ResNet50 ONNX Input: name={inp_res.name}, shape={inp_res.shape}, dtype={inp_res.type}")
    print(f"ResNet50 ONNX Output: name={out_res.name}, shape={out_res.shape}, dtype={out_res.type}")

    dummy_res_in = np.ones((1, 3, 224, 224), dtype=np.float32)
    resnet_res = sess_resnet.run(None, {inp_res.name: dummy_res_in})[0]
    print(f"ResNet50 ONNX Inferensi berhasil: shape output={resnet_res.shape}, logits={resnet_res[0].tolist()}")


if __name__ == "__main__":
    root_dir = Path(__file__).resolve().parent.parent
    demo_dir_model = root_dir / "Model_demo"
    demo_dir_backend = root_dir / "backend" / "models_demo"

    generate_all_demo_models(demo_dir_model)
    validate_with_ort(demo_dir_model)

    # Sinkronkan ke backend/models_demo
    if demo_dir_backend.exists():
        shutil.rmtree(demo_dir_backend)
    shutil.copytree(demo_dir_model, demo_dir_backend)
    print(f"[OK] Disinkronkan ke {demo_dir_backend}")
