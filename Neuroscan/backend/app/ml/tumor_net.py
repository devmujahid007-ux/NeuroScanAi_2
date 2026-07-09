"""
Default 2D slice classifier architecture for brain MRI.

If ``best_model.pth`` was trained with a different network, replace this module
or set TUMOR_MODEL_CLASS in the environment to a custom import path (advanced).
"""

from __future__ import annotations

import torch
import torch.nn as nn


class TumorSliceClassifier(nn.Module):
    """Single-channel 2D CNN — typical for slice-wise tumor screening."""

    def __init__(self, num_classes: int = 4):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d(1),
        )
        self.fc = nn.Linear(128, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = torch.flatten(x, 1)
        return self.fc(x)


def build_model(num_classes: int) -> TumorSliceClassifier:
    return TumorSliceClassifier(num_classes=num_classes)
