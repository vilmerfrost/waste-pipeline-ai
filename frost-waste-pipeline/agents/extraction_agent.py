"""
Collecct Extraction Agent
Processes waste management documents with strict validation
"""

import json
import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import logging
import os
from anthropic import Anthropic
import pdfplumber
import openpyxl
import pandas as pd

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ValidationStatus(Enum):
    VALID = "valid"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class ValidationIssue:
    row_index: int
    field: str
    issue_type: ValidationStatus
    message: str


@dataclass
class ExtractionResult:
    filename: str
    total_rows: int
    valid_rows: int
    extracted_data: List[Dict]
    validation_issues: List[ValidationIssue]
    summary: str
    confidence_score: float
    processing_time: float


class CollecctExtractorAgent:
    """
    Extraction agent for Collecct waste management documents
    Enforces strict validation rules
    """
    
    # Supported languages
    SUPPORTED_LANGUAGES = ['sv', 'fi', 'no', 'en', 'dk', 'no']
    
    # Only kg allowed - reject these units
    INVALID_UNITS = ['ton', 'tons', 'tonne', 'tonnes', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram']
    
    # Required fields
    REQUIRED_FIELDS = ['weight_kg', 'address', 'waste_type', 'date']
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize extraction agent
        
        Args:
            api_key: Anthropic API key (or set ANTHROPIC_API_KEY env var)
        """
        api_key = api_key or os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY must be provided or set as environment variable")
        self.client = Anthropic(api_key=api_key)
        
    def extract_from_document(self, file_path: str, language: str = 'sv') -> ExtractionResult:
        """
        Extract data from document with validation
        
        Args:
            file_path: Path to PDF or Excel file
            language: Document language (sv, fi, no, en)
            
        Returns:
            ExtractionResult with data and validation issues
        """
        import time
        start_time = time.time()
        
        logger.info(f"Extracting from {file_path} (language: {language})")
        
        # Step 1: Extract raw data
        raw_data = self._extract_raw_data(file_path, language)
        
        # Step 2: Validate and clean
        validated_data, issues = self._validate_and_clean(raw_data)
        
        # Step 3: Generate summary
        summary = self._generate_summary(validated_data, issues)
        
        # Step 4: Calculate confidence
        confidence = self._calculate_confidence(validated_data, issues)
        
        processing_time = time.time() - start_time
        
        return ExtractionResult(
            filename=os.path.basename(file_path),
            total_rows=len(raw_data),
            valid_rows=len(validated_data),
            extracted_data=validated_data,
            validation_issues=issues,
            summary=summary,
            confidence_score=confidence,
            processing_time=processing_time
        )
    
    def _extract_raw_data(self, file_path: str, language: str) -> List[Dict]:
        """
        Extract raw data from document using Claude API
        
        Args:
            file_path: Path to file
            language: Document language
            
        Returns:
            List of raw data rows
        """
        extraction_prompt = self._build_extraction_prompt(language)
        
        # Prepare file content for Claude
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext == '.pdf':
            # Read PDF
            with pdfplumber.open(file_path) as pdf:
                text_content = "\n".join([page.extract_text() or "" for page in pdf.pages[:10]])  # First 10 pages
                
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=[{
                    "role": "user",
                    "content": f"{extraction_prompt}\n\nDocument text:\n{text_content}"
                }]
            )
            
        elif file_ext in ['.xlsx', '.xls']:
            # Read Excel
            df = pd.read_excel(file_path, nrows=50)  # First 50 rows
            csv_preview = df.to_csv(index=False)
            
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=[{
                    "role": "user",
                    "content": f"{extraction_prompt}\n\nExcel preview (first 50 rows):\n{csv_preview}"
                }]
            )
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")
        
        # Parse response
        response_text = message.content[0].text if message.content else ""
        
        # Extract JSON from response
        try:
            # Try to find JSON in response
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                raw_data = json.loads(json_match.group())
            else:
                # Try to parse entire response as JSON
                raw_data = json.loads(response_text)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse JSON from Claude response")
            raw_data = []
        
        return raw_data if isinstance(raw_data, list) else []
    
    def _build_extraction_prompt(self, language: str) -> str:
        """
        Build Claude prompt for extraction with validation rules
        
        Args:
            language: Document language
            
        Returns:
            Extraction prompt
        """
        prompt = f"""Extract waste management data from this document.

CRITICAL REQUIREMENTS:
1. Weight MUST be in kilograms (kg) ONLY
2. Every row MUST have an address
3. Extract these fields: weight_kg, address, waste_type, date, hazardous (optional)

LANGUAGE: {language}

OUTPUT FORMAT (JSON array):
[
  {{
    "weight": "<value with unit>",
    "address": "<full address>",
    "waste_type": "<type in {language}>",
    "date": "YYYY-MM-DD",
    "hazardous": true/false,
    "confidence": 0.0-1.0
  }}
]

VALIDATION RULES:
- If weight is in tons, convert to kg (1 ton = 1000 kg) and include original value
- If weight is in grams (g), convert to kg (÷ 1000)
- If weight is in pounds (lbs), convert to kg (1 lb = 0.453592 kg)
- ALWAYS output weight_kg in kilograms after conversion
- If address is missing, flag as ERROR
- If date format is unclear, use best guess and mark confidence < 0.9
- Hazardous field is low priority - OK to leave null

Extract all rows. Flag issues but include data anyway."""
        
        return prompt
    
    def _validate_and_clean(self, raw_data: List[Dict]) -> Tuple[List[Dict], List[ValidationIssue]]:
        """
        Validate data against Collecct rules
        
        Args:
            raw_data: Raw extracted data
            
        Returns:
            Tuple of (cleaned_data, validation_issues)
        """
        cleaned_data = []
        issues = []
        
        for idx, row in enumerate(raw_data):
            row_issues = []
            cleaned_row = {}
            
            # Validate weight
            weight_value, weight_issues = self._validate_weight(row.get('weight', ''), idx)
            cleaned_row['weight_kg'] = weight_value
            row_issues.extend(weight_issues)
            
            # Validate address
            address, address_issues = self._validate_address(row.get('address', ''), idx)
            cleaned_row['address'] = address
            row_issues.extend(address_issues)
            
            # Other fields (less strict)
            cleaned_row['waste_type'] = row.get('waste_type', '')
            cleaned_row['date'] = row.get('date', '')
            cleaned_row['hazardous'] = row.get('hazardous', False)
            cleaned_row['confidence'] = row.get('confidence', 0.5)
            
            # Only include row if no ERROR-level issues
            has_errors = any(issue.issue_type == ValidationStatus.ERROR for issue in row_issues)
            
            if not has_errors:
                cleaned_data.append(cleaned_row)
            
            issues.extend(row_issues)
        
        return cleaned_data, issues
    
    def _validate_weight(self, weight_str: str, row_idx: int) -> Tuple[Optional[float], List[ValidationIssue]]:
        """
        Validate and extract weight in kg
        
        Args:
            weight_str: Weight string from extraction
            row_idx: Row index for issue tracking
            
        Returns:
            Tuple of (weight_kg, issues)
        """
        issues = []
        
        if not weight_str:
            issues.append(ValidationIssue(
                row_index=row_idx,
                field='weight',
                issue_type=ValidationStatus.ERROR,
                message='Missing weight value'
            ))
            return None, issues
        
        # Extract number
        numbers = re.findall(r'[\d,.]+', str(weight_str))
        if not numbers:
            issues.append(ValidationIssue(
                row_index=row_idx,
                field='weight',
                issue_type=ValidationStatus.ERROR,
                message=f'Could not parse weight: {weight_str}'
            ))
            return None, issues
        
        value = float(numbers[0].replace(',', '.'))
        
        # Check unit and convert to kg
        weight_lower = str(weight_str).lower()
        original_value = value
        converted = False
        
        # Convert tons to kg
        if ('ton' in weight_lower or weight_lower.strip().endswith('t')) and 'kg' not in weight_lower:
            value = value * 1000
            converted = True
            issues.append(ValidationIssue(
                row_index=row_idx,
                field='weight',
                issue_type=ValidationStatus.WARNING,
                message=f'Converted {weight_str} ({original_value} ton) to {value} kg'
            ))
        
        # Convert grams to kg
        elif ('gram' in weight_lower or (weight_lower.strip().endswith('g') and 'kg' not in weight_lower)):
            value = value / 1000
            converted = True
            issues.append(ValidationIssue(
                row_index=row_idx,
                field='weight',
                issue_type=ValidationStatus.WARNING,
                message=f'Converted {weight_str} ({original_value} g) to {value} kg'
            ))
        
        # Convert pounds to kg
        elif 'lb' in weight_lower or 'pound' in weight_lower:
            value = value * 0.453592
            converted = True
            issues.append(ValidationIssue(
                row_index=row_idx,
                field='weight',
                issue_type=ValidationStatus.WARNING,
                message=f'Converted {weight_str} ({original_value} lbs) to {value:.2f} kg'
            ))
        
        return value, issues
    
    def _validate_address(self, address: str, row_idx: int) -> Tuple[Optional[str], List[ValidationIssue]]:
        """
        Validate address field
        
        Args:
            address: Address string
            row_idx: Row index
            
        Returns:
            Tuple of (address, issues)
        """
        issues = []
        
        if not address or len(str(address).strip()) < 5:
            issues.append(ValidationIssue(
                row_index=row_idx,
                field='address',
                issue_type=ValidationStatus.ERROR,
                message='Missing or incomplete address'
            ))
            return None, issues
        
        # Basic validation - should have street and number
        if not any(char.isdigit() for char in str(address)):
            issues.append(ValidationIssue(
                row_index=row_idx,
                field='address',
                issue_type=ValidationStatus.WARNING,
                message='Address may be incomplete (no street number)'
            ))
        
        return str(address).strip(), issues
    
    def _generate_summary(self, validated_data: List[Dict], issues: List[ValidationIssue]) -> str:
        """
        Generate human-readable summary
        
        Args:
            validated_data: Cleaned data
            issues: Validation issues
            
        Returns:
            Summary string
        """
        total_rows = len(validated_data) + sum(1 for i in issues if i.issue_type == ValidationStatus.ERROR)
        valid_rows = len(validated_data)
        error_count = sum(1 for i in issues if i.issue_type == ValidationStatus.ERROR)
        warning_count = sum(1 for i in issues if i.issue_type == ValidationStatus.WARNING)
        
        missing_addresses = sum(1 for i in issues if i.field == 'address' and i.issue_type == ValidationStatus.ERROR)
        
        summary = f"""Extraction Complete:
- Total entries: {total_rows}
- Valid entries: {valid_rows}
- Errors: {error_count}
- Warnings: {warning_count}
- Missing addresses: {missing_addresses}
"""
        
        return summary
    
    def _calculate_confidence(self, validated_data: List[Dict], issues: List[ValidationIssue]) -> float:
        """
        Calculate overall confidence score
        
        Args:
            validated_data: Cleaned data
            issues: Validation issues
            
        Returns:
            Confidence score (0.0-1.0)
        """
        if not validated_data:
            return 0.0
        
        # Average field confidence
        field_confidence = sum(row.get('confidence', 0.5) for row in validated_data) / len(validated_data)
        
        # Penalty for issues
        error_penalty = sum(1 for i in issues if i.issue_type == ValidationStatus.ERROR) * 0.1
        warning_penalty = sum(1 for i in issues if i.issue_type == ValidationStatus.WARNING) * 0.05
        
        confidence = max(0.0, field_confidence - error_penalty - warning_penalty)
        
        return round(confidence, 2)
    
    def export_to_json(self, result: ExtractionResult, output_path: str):
        """
        Export extraction result to JSON
        
        Args:
            result: Extraction result
            output_path: Path to save JSON
        """
        output = {
            'filename': result.filename,
            'processed_at': str(result.processing_time),
            'summary': result.summary,
            'confidence': result.confidence_score,
            'data': result.extracted_data,
            'issues': [
                {
                    'row': i.row_index,
                    'field': i.field,
                    'type': i.issue_type.value,
                    'message': i.message
                }
                for i in result.validation_issues
            ]
        }
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Exported results to {output_path}")


# CLI for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python extraction_agent.py <file_path> [language]")
        print("\nExample:")
        print("  python extraction_agent.py invoice.pdf sv")
        sys.exit(1)
    
    file_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else 'sv'
    
    print(f"🤖 Extracting data from {file_path}...")
    
    agent = CollecctExtractorAgent()
    result = agent.extract_from_document(file_path, language)
    
    print(f"\n{result.summary}")
    print(f"Confidence: {result.confidence_score * 100}%")
    print(f"Processing time: {result.processing_time:.2f}s")
    
    if result.validation_issues:
        print(f"\n⚠️  Validation Issues:")
        for issue in result.validation_issues:
            emoji = "❌" if issue.issue_type == ValidationStatus.ERROR else "⚠️"
            print(f"  {emoji} Row {issue.row_index} ({issue.field}): {issue.message}")
    
    # Export
    output_path = file_path.replace('.pdf', '_extracted.json').replace('.xlsx', '_extracted.json')
    agent.export_to_json(result, output_path)
    print(f"\n✅ Results saved to {output_path}")
