from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


StudyLanguage = Literal["KAZAKH", "RUSSIAN", "ENGLISH"]


class AcademicDegreeBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=50)
    is_active: bool = True


class AcademicDegreeCreate(AcademicDegreeBase):
    pass


class AcademicDegreeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=50)
    is_active: bool | None = None


class AcademicDegreeResponse(AcademicDegreeBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EducationalProgramBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    name_kk: str = Field(min_length=1, max_length=255)
    name_en: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=50)
    academic_degree_id: int = Field(gt=0)
    requires_service_language: bool = True
    is_active: bool = True


class EducationalProgramCreate(EducationalProgramBase):
    pass


class EducationalProgramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    name_kk: str | None = Field(default=None, min_length=1, max_length=255)
    name_en: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=50)
    academic_degree_id: int | None = Field(default=None, gt=0)
    requires_service_language: bool | None = None
    is_active: bool | None = None


class EducationalProgramResponse(EducationalProgramBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OperatorEducationalProgramsUpdate(BaseModel):
    educational_program_ids: list[int]
    study_languages_by_program: dict[int, list[StudyLanguage]] = Field(default_factory=dict)


class OperatorEducationalProgramResponse(EducationalProgramResponse):
    study_languages: list[StudyLanguage]


class OperatorAcademicDegreesUpdate(BaseModel):
    academic_degree_ids: list[int]
