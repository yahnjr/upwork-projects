import json
import requests
import time
from typing import List, Dict, Any

class DaycareFinder:
    def __init__(self, overpass_url: str = "https://overpass-api.de/api/interpreter"):
        self.overpass_url = overpass_url
        self.results = []
    
    def load_military_bases(self, file_path: str) -> List[Dict]:
        """Load military base polygons from JSON file"""
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            # Handle different JSON structures
            if isinstance(data, dict):
                if 'features' in data:  # GeoJSON format
                    return data['features']
                elif 'bases' in data or 'polygons' in data:  # Custom format
                    return data.get('bases', data.get('polygons', []))
                else:
                    return [data]  # Single polygon
            elif isinstance(data, list):
                return data
            else:
                raise ValueError("Unsupported JSON format")
                
        except FileNotFoundError:
            print(f"Error: File {file_path} not found")
            return []
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON in {file_path}")
            return []
    
    def extract_coordinates(self, polygon_data: Dict) -> List[List[float]]:
        """Extract coordinates from polygon data (handles GeoJSON and custom formats)"""
        try:
            # GeoJSON format
            if 'geometry' in polygon_data:
                coords = polygon_data['geometry']['coordinates']
                if polygon_data['geometry']['type'] == 'Polygon':
                    return coords[0]  # First ring (exterior)
                elif polygon_data['geometry']['type'] == 'MultiPolygon':
                    return coords[0][0]  # First polygon, first ring
            
            # Custom format - direct coordinates
            elif 'coordinates' in polygon_data:
                return polygon_data['coordinates']
            
            # Array of coordinate pairs
            elif isinstance(polygon_data, list) and len(polygon_data) > 0:
                return polygon_data
            
            else:
                print(f"Warning: Could not extract coordinates from {polygon_data}")
                return []
                
        except (KeyError, IndexError, TypeError) as e:
            print(f"Error extracting coordinates: {e}")
            return []
    
    def format_polygon_for_overpass(self, coordinates: List[List[float]]) -> str:
        """Convert coordinate array to Overpass polygon format"""
        # Overpass expects: "lat1 lon1 lat2 lon2 ..."
        coord_pairs = []
        for coord in coordinates:
            if len(coord) >= 2:
                # Handle both [lon, lat] and [lat, lon] formats
                # GeoJSON uses [lon, lat], but we need to detect which is which
                lon, lat = coord[0], coord[1]
                coord_pairs.append(f"{lat} {lon}")
        
        return " ".join(coord_pairs)
    
    def build_overpass_query(self, polygon_string: str) -> str:
        """Build Overpass API query for daycare centers within polygon"""
        query = f"""
        [out:json][timeout:25];
        (
          node["amenity"~"^(kindergarten|childcare)$"](poly:"{polygon_string}");
          way["amenity"~"^(kindergarten|childcare)$"](poly:"{polygon_string}");
          relation["amenity"~"^(kindergarten|childcare)$"](poly:"{polygon_string}");
          node["amenity"="nursery"](poly:"{polygon_string}");
          way["amenity"="nursery"](poly:"{polygon_string}");
          relation["amenity"="nursery"](poly:"{polygon_string}");
        );
        out center meta;
        """
        return query.strip()
    
    def query_overpass(self, query: str) -> Dict[str, Any]:
        """Execute Overpass API query"""
        try:
            response = requests.post(
                self.overpass_url,
                data=query,
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        
        except requests.exceptions.RequestException as e:
            print(f"Error querying Overpass API: {e}")
            return {"elements": []}
        except json.JSONDecodeError:
            print("Error: Invalid JSON response from Overpass API")
            return {"elements": []}
    
    def process_overpass_results(self, results: Dict, base_info: Dict) -> List[Dict]:
        """Process Overpass API results and format for output"""
        daycares = []
        
        for element in results.get('elements', []):
            daycare = {
                'id': element.get('id'),
                'type': element.get('type'),
                'lat': element.get('lat') or element.get('center', {}).get('lat'),
                'lon': element.get('lon') or element.get('center', {}).get('lon'),
                'tags': element.get('tags', {}),
                'military_base': {
                    'name': base_info.get('name', 'Unknown'),
                    'id': base_info.get('id', 'Unknown')
                }
            }
            
            # Extract useful information from tags
            tags = daycare['tags']
            daycare['name'] = tags.get('name', 'Unnamed Daycare')
            daycare['amenity'] = tags.get('amenity')
            daycare['phone'] = tags.get('phone')
            daycare['website'] = tags.get('website')
            daycare['opening_hours'] = tags.get('opening_hours')
            daycare['address'] = {
                'street': tags.get('addr:street'),
                'city': tags.get('addr:city'),
                'state': tags.get('addr:state'),
                'postcode': tags.get('addr:postcode')
            }
            
            daycares.append(daycare)
        
        return daycares
    
    def find_daycares_near_bases(self, json_file_path: str, output_file: str = 'daycare_results.json'):
        """Main function to find daycares near military bases"""
        print("Loading military base data...")
        bases = self.load_military_bases(json_file_path)
        
        if not bases:
            print("No military base data found. Exiting.")
            return
        
        print(f"Found {len(bases)} military bases")
        
        all_results = {
            'summary': {
                'total_bases_processed': 0,
                'total_daycares_found': 0,
                'generated_at': time.strftime('%Y-%m-%d %H:%M:%S')
            },
            'bases': []
        }
        
        for i, base in enumerate(bases):
            print(f"Processing base {i+1}/{len(bases)}")
            
            # Extract base information
            base_name = base.get('name') or base.get('properties', {}).get('name', f'Base_{i+1}')
            base_id = base.get('id') or base.get('properties', {}).get('id', f'base_{i+1}')
            
            # Extract coordinates
            coordinates = self.extract_coordinates(base)
            if not coordinates:
                print(f"Skipping base {base_name} - no valid coordinates found")
                continue
            
            # Format for Overpass
            polygon_string = self.format_polygon_for_overpass(coordinates)
            if not polygon_string:
                print(f"Skipping base {base_name} - could not format coordinates")
                continue
            
            # Build and execute query
            query = self.build_overpass_query(polygon_string)
            print(f"Querying daycares for {base_name}...")
            
            results = self.query_overpass(query)
            
            # Process results
            base_info = {'name': base_name, 'id': base_id}
            daycares = self.process_overpass_results(results, base_info)
            
            base_result = {
                'base_name': base_name,
                'base_id': base_id,
                'daycare_count': len(daycares),
                'daycares': daycares
            }
            
            all_results['bases'].append(base_result)
            all_results['summary']['total_daycares_found'] += len(daycares)
            
            print(f"Found {len(daycares)} daycares near {base_name}")
            
            # Rate limiting - be nice to the Overpass API
            time.sleep(1)
        
        all_results['summary']['total_bases_processed'] = len(all_results['bases'])
        
        # Save results
        with open(output_file, 'w') as f:
            json.dump(all_results, f, indent=2)
        
        print(f"\nResults saved to {output_file}")
        print(f"Total bases processed: {all_results['summary']['total_bases_processed']}")
        print(f"Total daycares found: {all_results['summary']['total_daycares_found']}")

# Example usage
if __name__ == "__main__":
    finder = DaycareFinder()
    
    # Replace 'military_bases.json' with your actual file path
    finder.find_daycares_near_bases(r"C:\Users\iform\OneDrive\Desktop\documents\upwork\active\MustWants\us-military-bases.json", 'daycare_results.json')

def develop_urls(base_name:str):
    base_name_url = base_name.replace(" ", "-").lower()
    url = f"https://installations.militaryonesource.mil/military-installation/{base_name_url}/child-and-youth-services/child-and-youth-programs"
    print(f"Developed URL for {base_name}: {url}")
    return url

