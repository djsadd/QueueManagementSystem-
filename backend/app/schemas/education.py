from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    code: str = Field(min_length=1, max_length=50)
    academic_degree_id: int = Field(gt=0)
    is_active: bool = True


class EducationalProgramCreate(EducationalProgramBase):
    pass


class EducationalProgramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=50)
    academic_degree_id: int | None = Field(default=None, gt=0)
    is_active: bool | None = None


class EducationalProgramResponse(EducationalProgramBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OperatorEducationalProgramsUpdate(BaseModel):
    educational_program_ids: list[int]
