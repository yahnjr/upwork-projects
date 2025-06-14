import os
import json
from collections import defaultdict

ROOT_DIR = '.'
OUTPUT_FILE = 'projects.json'
IGNORE_FOLDERS = ['california_data', 'basic-blog', 'old']

def format_name(name):
    return name.replace('-', ' ').replace('_', ' ').title()

def load_existing_json(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def flatten_existing(existing):
    """Flatten grouped projects into a dict for quick lookup by path"""
    flat = {}
    for group in existing:
        for proj in group.get('projects', []):
            flat[proj['path']] = proj
    return flat

def find_projects(root_dir):
    grouped = defaultdict(list)

    for dirpath, _, filenames in os.walk(root_dir):
        folder_name = os.path.basename(dirpath)
        if folder_name in IGNORE_FOLDERS:
            continue
        if 'index.html' in filenames:
            rel_path = os.path.relpath(dirpath, root_dir)
            path_parts = rel_path.split(os.sep)
            if len(path_parts) > 1:
                group = format_name(path_parts[0])
            else:
                group = "Ungrouped"

            project_name = format_name(folder_name)
            project_path = os.path.join(rel_path, 'index.html').replace('\\', '/')

            grouped[group].append({
                'name': project_name,
                'path': project_path,
                'description': ''
            })

    return grouped

def merge_projects(existing_flat, new_grouped):
    merged = []

    for group_name, projects in new_grouped.items():
        group_list = []
        for proj in projects:
            existing = existing_flat.get(proj['path'])
            if existing:
                proj['description'] = existing.get('description', '')
            group_list.append(proj)
        merged.append({
            'group': group_name,
            'projects': group_list
        })

    return merged

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

if __name__ == '__main__':
    found = find_projects(ROOT_DIR)
    existing = load_existing_json(OUTPUT_FILE)
    existing_flat = flatten_existing(existing)
    merged = merge_projects(existing_flat, found)
    save_json(OUTPUT_FILE, merged)
    print(f"Updated {OUTPUT_FILE} with grouped entries.")
