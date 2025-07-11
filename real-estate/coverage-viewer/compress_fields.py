import pandas as pd
import re

def compress_array_fields(df, field_prefix, new_field_name):
    """
    Compress array-like fields (e.g., field[1], field[2], etc.) into a single array field.
    
    Args:
        df: DataFrame to process
        field_prefix: Prefix of the fields to compress (e.g., 'coverage_zipcodes')
        new_field_name: Name for the new compressed field
    
    Returns:
        DataFrame with compressed field and original array fields removed
    """
    # Find all columns that match the pattern field_prefix[number]
    pattern = f"{field_prefix}\\[\\d+\\]"
    array_columns = [col for col in df.columns if re.match(pattern, col)]
    
    if not array_columns:
        print(f"No columns found matching pattern: {field_prefix}[n]")
        return df
    
    # Sort columns by their index number to maintain order
    def extract_index(col_name):
        match = re.search(r'\[(\d+)\]', col_name)
        return int(match.group(1)) if match else 0
    
    array_columns.sort(key=extract_index)
    
    print(f"Found {len(array_columns)} columns to compress: {array_columns}")
    
    # Create the compressed array field
    def create_array(row):
        # Collect non-null, non-empty values from the array columns
        values = []
        for col in array_columns:
            value = row[col]
            if pd.notna(value) and str(value).strip():  # Check for non-null and non-empty
                values.append(str(value).strip())
        return values if values else None
    
    # Apply the compression
    df[new_field_name] = df.apply(create_array, axis=1)
    
    # Drop the original array columns
    df_compressed = df.drop(columns=array_columns)
    
    print(f"Compressed {len(array_columns)} columns into '{new_field_name}'")
    return df_compressed

def process_realtors_csv(file_path):
    """Process the realtors CSV file."""
    print("Processing prod.realtors.csv...")
    df = pd.read_csv(file_path)
    
    print(f"Original shape: {df.shape}")
    print(f"Original columns: {list(df.columns)}")
    
    # Compress coverage_zipcodes fields
    df_compressed = compress_array_fields(df, 'coverage_zipcodes', 'coverage_zipcodes_array')
    
    print(f"New shape: {df_compressed.shape}")
    print(f"Sample of compressed data:")
    print(df_compressed[['coverage_zipcodes_array']].head())
    
    return df_compressed

def process_lenders_csv(file_path):
    """Process the lenders CSV file."""
    print("Processing prod.lenders.csv...")
    df = pd.read_csv(file_path)
    
    print(f"Original shape: {df.shape}")
    print(f"Original columns: {list(df.columns)}")
    
    # Compress states fields
    df_compressed = compress_array_fields(df, 'states', 'states_array')
    
    print(f"New shape: {df_compressed.shape}")
    print(f"Sample of compressed data:")
    print(df_compressed[['states_array']].head())
    
    return df_compressed

# Main execution
if __name__ == "__main__":
    import os
    
    # Define file paths - modify these as needed
    realtors_path = r"C:\apps\upwork\real-estate\coverage-viewer\prod.realtors.csv"  # Change this to your full path if needed
    lenders_path = r"C:\apps\upwork\real-estate\coverage-viewer\prod.lenders.csv"    # Change this to your full path if needed
    
    # Alternative: uncomment and modify these lines to use custom paths
    # realtors_path = r'C:\path\to\your\prod.realtors.csv'
    # lenders_path = r'C:\path\to\your\prod.lenders.csv'
    
    # Process realtors file
    try:
        if os.path.exists(realtors_path):
            realtors_df = process_realtors_csv(realtors_path)
            
            # Overwrite the original file with the compressed version
            realtors_df.to_csv(realtors_path, index=False)
            print(f"Updated original file '{realtors_path}' with compressed data")
        else:
            print(f"Error: {realtors_path} not found")
    except Exception as e:
        print(f"Error processing realtors file: {e}")
    
    print("\n" + "="*50 + "\n")
    
    # Process lenders file
    try:
        if os.path.exists(lenders_path):
            lenders_df = process_lenders_csv(lenders_path)
            
            # Overwrite the original file with the compressed version
            lenders_df.to_csv(lenders_path, index=False)
            print(f"Updated original file '{lenders_path}' with compressed data")
        else:
            print(f"Error: {lenders_path} not found")
    except Exception as e:
        print(f"Error processing lenders file: {e}")
    
    print("\nProcessing complete!")