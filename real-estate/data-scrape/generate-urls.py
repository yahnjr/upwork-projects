import json
import csv
from typing import List, Tuple

def develop_urls(base_name: str) -> str:
    """Generate URL for military base child and youth services page"""
    base_name_url = base_name.replace(" ", "-").lower()
    url = f"https://installations.militaryonesource.mil/military-installation/{base_name_url}/child-and-youth-services/child-and-youth-programs"
    print(f"Developed URL for {base_name}: {url}")
    return url

def load_military_bases_json(file_path: str) -> List[dict]:
    """Load military bases from GeoJSON file"""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        if data.get('type') == 'FeatureCollection' and 'features' in data:
            return data['features']
        else:
            print("Warning: JSON file doesn't appear to be a FeatureCollection")
            return []
            
    except FileNotFoundError:
        print(f"Error: File {file_path} not found")
        return []
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in {file_path}")
        return []

def generate_base_urls(json_file_path: str, output_csv: str = 'military_base_urls.csv') -> List[Tuple[str, str]]:
    """Generate URLs for all military bases and save to CSV"""
    
    # Load the JSON data
    print(f"Loading military bases from {json_file_path}...")
    features = load_military_bases_json(json_file_path)
    
    if not features:
        print("No military base data found. Exiting.")
        return []
    
    print(f"Found {len(features)} military installations")
    
    # Extract installation names and generate URLs
    base_urls = []
    
    for feature in features:
        try:
            properties = feature.get('properties', {})
            installation_name = properties.get('installation')
            
            if installation_name:
                url = develop_urls(installation_name)
                base_urls.append((installation_name, url))
            else:
                print("Warning: Found feature without 'installation' property")
                
        except Exception as e:
            print(f"Error processing feature: {e}")
            continue
    
    # Save to CSV
    print(f"\nSaving {len(base_urls)} URLs to {output_csv}...")
    
    try:
        with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            
            # Write header
            writer.writerow(['Base Name', 'URL'])
            
            # Write data
            writer.writerows(base_urls)
        
        print(f"Successfully saved URLs to {output_csv}")
        
    except Exception as e:
        print(f"Error saving CSV file: {e}")
    
    return base_urls

def generate_base_urls_with_details(json_file_path: str, output_csv: str = 'military_base_urls_detailed.csv') -> List[dict]:
    """Generate URLs with additional base details and save to CSV"""
    
    # Load the JSON data
    print(f"Loading military bases from {json_file_path}...")
    features = load_military_bases_json(json_file_path)
    
    if not features:
        print("No military base data found. Exiting.")
        return []
    
    print(f"Found {len(features)} military installations")
    
    # Extract installation data and generate URLs
    base_data = []
    
    for feature in features:
        try:
            properties = feature.get('properties', {})
            installation_name = properties.get('installation')
            
            if installation_name:
                url = develop_urls(installation_name)
                
                base_info = {
                    'installation': installation_name,
                    'branch': properties.get('branch', ''),
                    'state': properties.get('state', ''),
                    'joint_base': properties.get('jointBase', ''),
                    'latitude': properties.get('locationLat', ''),
                    'longitude': properties.get('locationLong', ''),
                    'url': url
                }
                
                base_data.append(base_info)
            else:
                print("Warning: Found feature without 'installation' property")
                
        except Exception as e:
            print(f"Error processing feature: {e}")
            continue
    
    # Save detailed CSV
    print(f"\nSaving {len(base_data)} detailed records to {output_csv}...")
    
    try:
        with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
            if base_data:
                fieldnames = base_data[0].keys()
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                # Write header
                writer.writeheader()
                
                # Write data
                writer.writerows(base_data)
        
        print(f"Successfully saved detailed URLs to {output_csv}")
        
    except Exception as e:
        print(f"Error saving detailed CSV file: {e}")
    
    return base_data

# Example usage
if __name__ == "__main__":
    # Replace 'military_bases.json' with your actual file path
    json_file = r"C:\Users\iform\OneDrive\Desktop\documents\upwork\active\MustWants\us-military-bases.json"
    
    print("=== Generating Basic URLs ===")
    basic_urls = generate_base_urls(json_file, 'military_base_urls.csv')
    
    print("\n=== Generating Detailed URLs ===")
    detailed_urls = generate_base_urls_with_details(json_file, 'military_base_urls_detailed.csv')
    
    print(f"\nSummary:")
    print(f"- Basic CSV: {len(basic_urls)} base URLs generated")
    print(f"- Detailed CSV: {len(detailed_urls)} base records with additional info")