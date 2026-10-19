"""用途：把用户提供的蜡笔头像拆成可活动的图层，保留原图供对照。

示例：python scripts/prepare_avatar.py --source "头像路径.jpg"
依赖：Pillow、NumPy、OpenCV。补脸采用周围像素修补，不调用生图服务。
"""

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description="拆分头像、眼镜和眼睛")
    parser.add_argument("--source", required=True)
    options = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "assets"
    output.mkdir(exist_ok=True)
    original = Image.open(options.source).convert("RGB").resize((1206, 1206))
    original.save(output / "avatar-original.jpg", quality=95)
    pixels = np.array(original)

    # 只删除与画布边缘连通的白背景，围巾里的浅色纹理会保留。
    light = (pixels.min(axis=2) > 241).astype(np.uint8)
    _, regions = cv2.connectedComponents(light)
    edge_regions = np.unique(np.concatenate((regions[0], regions[-1], regions[:, 0], regions[:, -1])))
    outside = np.isin(regions, edge_regions[edge_regions != 0])
    alpha = np.where(outside, 0, 255).astype(np.uint8)

    # 沿眼镜边框画窄蒙版，避免把镜片中的眼睛一起拿走。
    frame_paths = [
        [(283, 556), (303, 544), (348, 537), (398, 538), (458, 546), (494, 564), (505, 590), (497, 634), (482, 672), (464, 690), (426, 701), (370, 702), (332, 688), (306, 658), (292, 615), (285, 577), (283, 556)],
        [(585, 560), (608, 536), (650, 521), (700, 509), (744, 505), (780, 516), (798, 544), (799, 587), (787, 628), (769, 661), (738, 676), (692, 684), (649, 683), (616, 669), (599, 644), (587, 604), (585, 560)],
        [(492, 568), (518, 564), (544, 564), (565, 565), (592, 571)],
        [(285, 557), (264, 566)],
        [(779, 517), (789, 540), (790, 556)],
    ]
    tube_image = Image.new("L", original.size)
    drawing = ImageDraw.Draw(tube_image)
    for points in frame_paths:
        drawing.line(points, fill=255, width=35, joint="curve")
    dark = pixels.max(axis=2) < 135
    frames = ((np.array(tube_image) > 0) & dark).astype(np.uint8) * 255
    repair_mask = cv2.dilate(frames, np.ones((5, 5), np.uint8))
    repaired = cv2.inpaint(pixels, repair_mask, 9, cv2.INPAINT_TELEA)

    # 眼睛单独拆出，小幅追随指针；眼睛原位置也要修补，避免出现双影。
    eyes_mask = np.zeros(alpha.shape, dtype=np.uint8)
    eye_boxes = [(402, 559, 443, 628), (645, 548, 687, 611)]
    for index, (left, top, right, bottom) in enumerate(eye_boxes):
        local = dark[top:bottom, left:right].astype(np.uint8) * 255
        eyes_mask[top:bottom, left:right] = local
        eye_layer = np.zeros((*alpha.shape, 4), dtype=np.uint8)
        eye_layer[:, :, :3] = pixels
        eye_layer[top:bottom, left:right, 3] = local
        eye_layer[eye_layer[:, :, 3] == 0, :3] = 0
        Image.fromarray(eye_layer).save(output / f"eye-{index + 1}.png", optimize=True)
    repaired = cv2.inpaint(repaired, cv2.dilate(eyes_mask, np.ones((3, 3), np.uint8)), 7, cv2.INPAINT_TELEA)
    base_pixels = np.dstack((repaired, alpha))
    base_pixels[alpha == 0, :3] = 0
    Image.fromarray(base_pixels).save(output / "avatar-base.png", optimize=True)
    glasses = np.dstack((pixels, frames))
    glasses[frames == 0, :3] = 0
    Image.fromarray(glasses).save(output / "glasses.png", optimize=True)

    # 输出对照页实际使用的裸脸与重新合成头像，不另存重复的拼接预览图。
    base = Image.open(output / "avatar-base.png")
    combined = base.copy()
    for name in ("eye-1.png", "eye-2.png"):
        combined.alpha_composite(Image.open(output / name))
    combined.save(output / "avatar-without-glasses.png", optimize=True)
    combined.alpha_composite(Image.open(output / "glasses.png"))
    combined.save(output / "avatar-composed.png")
    print(f"头像素材已保存：{output}")


if __name__ == "__main__":
    main()
