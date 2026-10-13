Genome-scale COBRApy models are cached in this directory.

Supported IDs:
- e_coli_core
- iJO1366
- iML1515

Runtime behavior:
- If the JSON file already exists here, the server loads it locally with cobra.io.load_json_model.
- If it is missing, the server downloads the model from BiGG Models once and stores it here.

Expected filenames:
- e_coli_core.json
- iJO1366.json
- iML1515.json