from __future__ import annotations

from typing import Any, Dict, List


CURATED_MODULES: List[Dict[str, Any]] = [
    {
        "id": "studio-python-api-engine",
        "entity": "Python API Engine",
        "relative_path": "synbio-studio/src/panels/python-api-engine.js",
        "topic": "studio_python_api",
        "surface": "studio",
        "summary": "Centraliza en SynBio Studio el acceso visual a los endpoints locales del Python Engine para compilacion, simulacion, prediccion y analisis cientifico.",
        "when_to_use": "cuando quieres usar desde la interfaz del Studio capacidades del backend local sin salir a scripts o terminal",
        "user_question": "Estoy perdido. Quiero usar la IA, CRISPR o promotores desde SynBio Studio, donde entro?",
        "user_answer": "Entra por Python API Engine. Desde ahi puedes abrir pestañas concretas para promoter strength, codon optimization, CRISPR off-target, inverse design y ahora tambien el Tutor AI.",
        "first_checks": ["que el Python Engine responda en 127.0.0.1:8765", "que el panel abra la pestaña correcta", "que la entrada enviada al endpoint tenga formato valido"],
        "architecture_role": "Es la capa de acoplamiento entre el shell Electron y el backend cientifico local.",
        "tags": ["python api", "backend", "fastapi", "studio"]
    },
    {
        "id": "studio-tutorials-engine",
        "entity": "Tutorials Engine",
        "relative_path": "synbio-studio/src/panels/tutorials-engine.js",
        "topic": "studio_navigation",
        "surface": "studio",
        "summary": "Gestiona la experiencia de aprendizaje dentro de SynBio Studio y sirve como punto de entrada para onboarding, tutoriales guiados y descubrimiento de flujos.",
        "when_to_use": "cuando el usuario no sabe por donde empezar o necesita una ruta guiada en vez de explorar menus sueltos",
        "user_question": "Soy nuevo en SynBio Studio, que abro primero para aprender sin romper nada?",
        "user_answer": "Abre Tutorials Engine o el centro de aprendizaje. Esta hecho para guiarte por las capacidades principales antes de saltar a paneles tecnicos.",
        "first_checks": ["que el panel tutorials este renderizando en la sidebar", "que los tutorialId existan", "que el menu tutorials enrute al home correcto"],
        "architecture_role": "Actua como capa de onboarding y contexto pedagógico del shell del Studio.",
        "tags": ["tutorials", "onboarding", "learning", "studio"]
    },
    {
        "id": "studio-task-workflows-engine",
        "entity": "Task Workflows Engine",
        "relative_path": "synbio-studio/src/panels/task-workflows-engine.js",
        "topic": "studio_workflows",
        "surface": "studio",
        "summary": "Orquesta flujos guiados orientados a tareas reales, conectando varios paneles del Studio en vez de dejar al usuario montar la secuencia manualmente.",
        "when_to_use": "cuando quieres que el usuario complete un objetivo de principio a fin con pasos guiados y acciones encadenadas",
        "user_question": "No quiero ir panel por panel. Quiero que el Studio me lleve del diseño a la simulacion, hay algo para eso?",
        "user_answer": "Si. Task Workflows Engine es la pieza para flujos guiados y acciones encadenadas dentro del Studio.",
        "first_checks": ["que workflowId y stepId existan", "que las acciones deleguen a paneles reales", "que los tutoriales enlazados esten disponibles"],
        "architecture_role": "Es el coordinador de workflows transversales dentro del shell Electron.",
        "tags": ["workflow", "guided flow", "orchestration", "studio"]
    },
    {
        "id": "studio-biosafety-engine",
        "entity": "Biosafety Engine",
        "relative_path": "synbio-studio/src/panels/biosafety-engine.js",
        "topic": "studio_biosafety",
        "surface": "studio",
        "summary": "Agrupa dentro del Studio la interpretacion de riesgo biologico, bioseguridad y control de compliance para que no queden como chequeos externos desconectados.",
        "when_to_use": "cuando el usuario necesita evaluar riesgo, revisar BSL, validar kill switch o entender implicaciones de seguridad del diseño",
        "user_question": "Antes de seguir, quiero saber si este diseño es seguro o si me estoy metiendo en un problema de bioseguridad.",
        "user_answer": "Abre Biosafety Engine. Su trabajo es convertir seguridad y compliance en una superficie explicable dentro del Studio.",
        "first_checks": ["que el organismo y el contexto del diseño esten definidos", "que las reglas de seguridad esten cargadas", "que el usuario no confunda compliance con simple linting"],
        "architecture_role": "Es la capa de safety/compliance visible para el usuario final del Studio.",
        "tags": ["biosafety", "biosecurity", "bsl", "compliance", "studio"]
    },
    {
        "id": "studio-sim-engine",
        "entity": "Simulation Engine",
        "relative_path": "synbio-studio/src/panels/sim-engine.js",
        "topic": "studio_simulation",
        "surface": "studio",
        "summary": "Expone simulacion dentro de SynBio Studio como experiencia interactiva de usuario y no solo como llamada de backend o algoritmo aislado.",
        "when_to_use": "cuando el usuario quiere explorar dinamica del circuito, resultados visuales o comportamiento temporal desde el Studio",
        "user_question": "Quiero ver como se comporta el circuito sin salir del Studio. Cual es el panel de simulacion?",
        "user_answer": "El punto natural es Simulation Engine. Esta pensado para la ejecucion interactiva y la visualizacion de resultados dentro del Studio.",
        "first_checks": ["que el circuito o modelo de entrada exista", "que el panel de simulacion tenga datos validos", "que el usuario sepa si necesita ODE o SSA"],
        "architecture_role": "Es la superficie principal de simulacion integrada del Studio.",
        "tags": ["simulation", "ode", "ssa", "studio"]
    },
    {
        "id": "studio-sim-engine-advanced",
        "entity": "Advanced Simulation Engine",
        "relative_path": "synbio-studio/src/panels/sim-engine-advanced.js",
        "topic": "studio_simulation",
        "surface": "studio",
        "summary": "Amplia la simulacion con una capa mas rica o especializada para usuarios que necesitan mas control, configuracion o profundidad en la interpretacion.",
        "when_to_use": "cuando la simulacion basica se queda corta y necesitas controles avanzados o escenarios mas ricos",
        "user_question": "La simulacion normal se me queda simple. Donde esta la parte mas avanzada del Studio?",
        "user_answer": "Usa Advanced Simulation Engine cuando necesites una capa de simulacion mas configurable y profunda que la vista basica.",
        "first_checks": ["que el usuario realmente necesite la capa avanzada", "que los parametros tengan sentido fisico", "que la configuracion no contradiga el modelo base"],
        "architecture_role": "Es la extension avanzada de la capa de simulacion del Studio.",
        "tags": ["advanced simulation", "studio", "configuration"]
    },
    {
        "id": "studio-rna-structure-engine",
        "entity": "RNA Structure Engine",
        "relative_path": "synbio-studio/src/panels/rna-structure-engine.js",
        "topic": "studio_structure",
        "surface": "studio",
        "summary": "Lleva al Studio la prediccion y visualizacion de estructura de RNA como una herramienta especializada para diseño e interpretacion molecular.",
        "when_to_use": "cuando quieres estudiar plegamiento, estructura secundaria o el impacto de secuencias de RNA sobre comportamiento del diseño",
        "user_question": "Tengo dudas de RNA y estructuras secundarias. El Studio puede ayudarme sin salir a otra herramienta?",
        "user_answer": "Si. RNA Structure Engine existe para eso y debe verse como una herramienta estructural especializada dentro del Studio.",
        "first_checks": ["que la secuencia tenga formato correcto", "que el usuario distinga RNA de proteina", "que la interpretacion no extrapole mas alla de la prediccion"],
        "architecture_role": "Es una superficie estructural especializada del Studio para RNA.",
        "tags": ["rna", "folding", "secondary structure", "studio"]
    },
    {
        "id": "studio-protein-structure-engine",
        "entity": "Protein Structure Engine",
        "relative_path": "synbio-studio/src/panels/protein-structure-engine.js",
        "topic": "studio_structure",
        "surface": "studio",
        "summary": "Acerca al usuario del Studio la parte de estructura de proteinas y visualizacion asociada, enlazando prediccion y exploracion en la propia interfaz.",
        "when_to_use": "cuando necesitas analizar estructura de proteina, visualizar geometria o revisar confianza estructural en contexto de diseño",
        "user_question": "Donde miro la estructura de una proteina dentro de SynBio Studio?",
        "user_answer": "El panel correcto es Protein Structure Engine. Es la superficie estructural para proteinas dentro del Studio.",
        "first_checks": ["que la secuencia sea de aminoacidos", "que el backend o viewer asociado este disponible", "que la confianza estructural se interprete con prudencia"],
        "architecture_role": "Es la capa de visualizacion y analisis estructural de proteinas del Studio.",
        "tags": ["protein", "structure", "viewer", "studio"]
    },
    {
        "id": "studio-fba-engine",
        "entity": "FBA Engine",
        "relative_path": "synbio-studio/src/panels/fba-engine.js",
        "topic": "studio_data",
        "surface": "studio",
        "summary": "Hace visible en el Studio el razonamiento de flujo metabolico y los modelos de balance de flujo para usuarios que trabajan con metabolismo y rutas.",
        "when_to_use": "cuando quieres razonar sobre flujo metabolico, restricciones de red o impacto de intervenciones a nivel de metabolismo",
        "user_question": "Necesito ver si mi diseño tiene sentido metabolico. Que modulo del Studio es el correcto?",
        "user_answer": "FBA Engine es el modulo del Studio para flujo metabolico y razonamiento tipo flux balance analysis.",
        "first_checks": ["que el modelo metabolico exista", "que el usuario entienda los supuestos de FBA", "que las restricciones cargadas sean coherentes"],
        "architecture_role": "Es la superficie metabolica del Studio para analisis de flujo.",
        "tags": ["fba", "metabolism", "flux balance", "studio"]
    },
    {
        "id": "studio-blast-engine",
        "entity": "BLAST Engine",
        "relative_path": "synbio-studio/src/panels/blast-engine.js",
        "topic": "studio_data",
        "surface": "studio",
        "summary": "Integra busqueda de similitud de secuencias en el Studio para que el usuario no tenga que salir a una herramienta externa para una comprobacion basica de homologia o identidad.",
        "when_to_use": "cuando quieres buscar similitud, validar secuencias o contrastar contra referencias desde una superficie integrada",
        "user_question": "Quiero comparar una secuencia rapido dentro del Studio. Hay algun BLAST integrado?",
        "user_answer": "Si, el Studio tiene un BLAST Engine dedicado para esa necesidad.",
        "first_checks": ["que la secuencia de entrada sea valida", "que la base de datos o backend asociado este disponible", "que el usuario no confunda similitud con validacion biologica completa"],
        "architecture_role": "Es la superficie de busqueda de similitud de secuencias dentro del Studio.",
        "tags": ["blast", "sequence similarity", "studio"]
    },
    {
        "id": "studio-sbol-visual-engine",
        "entity": "SBOL Visual Engine",
        "relative_path": "synbio-studio/src/panels/sbol-visual-engine.js",
        "topic": "studio_design",
        "surface": "studio",
        "summary": "Convierte al Studio en una superficie de diseño y visualizacion de circuitos biológicos más gráfica, apoyándose en convenciones de representación tipo SBOL.",
        "when_to_use": "cuando necesitas ver, presentar o editar la estructura del circuito de forma visual en vez de quedarte solo en texto",
        "user_question": "No quiero mirar solo codigo. Donde veo el circuito visualmente en SynBio Studio?",
        "user_answer": "La respuesta natural es SBOL Visual Engine, porque es la pieza centrada en representacion visual del diseño.",
        "first_checks": ["que el diseño tenga una estructura representable", "que el usuario no espere semantica extra no modelada", "que el render no se use como sustituto de validacion tecnica"],
        "architecture_role": "Es la capa visual de diseño de circuitos dentro del Studio.",
        "tags": ["sbol", "visual design", "circuit", "studio"]
    },
    {
        "id": "studio-project-engine",
        "entity": "Project Engine",
        "relative_path": "synbio-studio/src/panels/project-engine.js",
        "topic": "studio_navigation",
        "surface": "studio",
        "summary": "Organiza la nocion de proyecto dentro del Studio y ayuda a que el usuario navegue activos, contexto y estructura de trabajo de forma coherente.",
        "when_to_use": "cuando el usuario necesita entender el estado global del proyecto y no solo un panel aislado",
        "user_question": "Estoy viendo herramientas sueltas pero no tengo claro donde esta el contexto del proyecto. Que modulo lo lleva?",
        "user_answer": "Project Engine es la pieza que da estructura al contexto del proyecto dentro del Studio.",
        "first_checks": ["que el workspace o proyecto este inicializado", "que los archivos relevantes se hayan indexado", "que el panel no este vacio por falta de contexto"],
        "architecture_role": "Es la capa de organizacion de proyecto del shell del Studio.",
        "tags": ["project", "workspace", "navigation", "studio"]
    },
    {
        "id": "studio-synbio-terminal-engine",
        "entity": "SynBio Terminal Engine",
        "relative_path": "synbio-studio/src/panels/synbio-terminal-engine.js",
        "topic": "studio_workflows",
        "surface": "studio",
        "summary": "Acerca una terminal integrada al Studio para que comandos, scripts y automatizaciones convivan con la interfaz de dominio.",
        "when_to_use": "cuando necesitas ejecutar comandos o scripts sin salir del Studio y manteniendo contexto de proyecto",
        "user_question": "Necesito terminal pero sin salir de SynBio Studio. Existe algo integrado?",
        "user_answer": "Si. SynBio Terminal Engine es justamente la terminal integrada del Studio.",
        "first_checks": ["que la terminal embebida haya inicializado", "que el cwd sea el correcto", "que el usuario diferencie terminal del panel Python API"],
        "architecture_role": "Es el puente entre interfaz especializada y ejecucion tipo shell dentro del Studio.",
        "tags": ["terminal", "shell", "workflow", "studio"]
    },
    {
        "id": "studio-workspace-engine",
        "entity": "Workspace Engine",
        "relative_path": "synbio-studio/src/panels/workspace-engine.js",
        "topic": "studio_navigation",
        "surface": "studio",
        "summary": "Da soporte a la nocion de workspace dentro del Studio y ayuda a que multiples activos, archivos y superficies se comporten como un mismo entorno coherente.",
        "when_to_use": "cuando el usuario trabaja con el Studio como entorno completo y no solo como visor de un archivo",
        "user_question": "Que pieza hace que todo esto parezca un workspace y no solo una ventana con paneles?",
        "user_answer": "Workspace Engine. Su papel es mantener la coherencia de entorno y contexto del Studio.",
        "first_checks": ["que el workspace este cargado", "que las vistas dependientes del workspace tengan acceso a estado", "que no haya confusion con Project Engine"],
        "architecture_role": "Es la capa de entorno de trabajo del Studio.",
        "tags": ["workspace", "environment", "studio"]
    },
    {
        "id": "studio-design-review-engine",
        "entity": "Design Review Engine",
        "relative_path": "synbio-studio/src/panels/design-review-engine.js",
        "topic": "studio_design",
        "surface": "studio",
        "summary": "Introduce una superficie de revision del diseño para que el Studio no se limite a crear artefactos, sino tambien a examinarlos críticamente.",
        "when_to_use": "cuando necesitas revisar decisiones de diseño, riesgos o puntos de mejora antes de seguir avanzando",
        "user_question": "Ya diseñe algo, pero quiero una vista de revision mas que de edicion. Hay un panel para eso?",
        "user_answer": "Si. Design Review Engine existe precisamente para revisar y evaluar el diseño desde una superficie dedicada.",
        "first_checks": ["que el diseño actual este disponible", "que la revision no dependa de contexto faltante", "que el usuario entienda que revisar no es lo mismo que ejecutar"],
        "architecture_role": "Es la capa de revision y evaluacion del diseño dentro del Studio.",
        "tags": ["design review", "evaluation", "studio"]
    },
    {
        "id": "studio-collaborative-engine",
        "entity": "Collaborative Engine",
        "relative_path": "synbio-studio/src/panels/collaborative-engine.js",
        "topic": "studio_workflows",
        "surface": "studio",
        "summary": "Apunta a capacidades de colaboracion dentro del Studio para que el trabajo no sea solo individual y local sino coordinable.",
        "when_to_use": "cuando necesitas trabajo compartido, coordinacion o alguna forma de colaboracion en el producto",
        "user_question": "Esto soporta colaboracion o todo esta pensado para una sola persona?",
        "user_answer": "Collaborative Engine es la pieza que responde a esa necesidad dentro del Studio.",
        "first_checks": ["que la funcionalidad este realmente disponible", "que el usuario no espere colaboracion universal si el motor aun esta parcial", "que el flujo de sincronizacion este claro"],
        "architecture_role": "Es la capa de colaboracion del shell del Studio.",
        "tags": ["collaboration", "shared workflow", "studio"]
    },
    {
        "id": "studio-lab-notebook-engine",
        "entity": "Lab Notebook Engine",
        "relative_path": "synbio-studio/src/panels/lab-notebook-engine.js",
        "topic": "studio_lab_automation",
        "surface": "studio",
        "summary": "Representa la parte de cuaderno de laboratorio dentro del Studio y ayuda a conectar diseño computacional con trazabilidad experimental.",
        "when_to_use": "cuando quieres registrar notas, decisiones o pasos de laboratorio junto al trabajo digital",
        "user_question": "Hay una parte tipo cuaderno de laboratorio en SynBio Studio o todo es puro diseño?",
        "user_answer": "Si, Lab Notebook Engine es la pieza enfocada en esa capa de trazabilidad y registro.",
        "first_checks": ["que el panel este disponible", "que el usuario sepa que es para registro y no para simulacion", "que el contexto de proyecto exista"],
        "architecture_role": "Es la capa de notebook y trazabilidad experimental del Studio.",
        "tags": ["lab notebook", "eln", "traceability", "studio"]
    },
    {
        "id": "studio-plasmid-map-engine",
        "entity": "Plasmid Map Engine",
        "relative_path": "synbio-studio/src/panels/plasmid-map-engine.js",
        "topic": "studio_design",
        "surface": "studio",
        "summary": "Da al Studio una vista especializada para mapas plasmídicos y representaciones de constructos en formato más accesible para análisis visual.",
        "when_to_use": "cuando el usuario necesita inspeccionar plasmidos, constructos circulares o distribucion de elementos en un vector",
        "user_question": "Quiero ver el plasmido como mapa y no solo como secuencia. Que panel uso?",
        "user_answer": "Plasmid Map Engine es la respuesta correcta dentro de SynBio Studio.",
        "first_checks": ["que haya datos de plasmido o vector", "que el usuario no espere simulacion funcional del mapa", "que la representacion visual corresponda al diseño cargado"],
        "architecture_role": "Es la capa visual dedicada a plasmidos y vectores dentro del Studio.",
        "tags": ["plasmid", "map", "vector", "studio"]
    },
    {
        "id": "studio-opentrons-engine",
        "entity": "Opentrons Engine",
        "relative_path": "synbio-studio/src/panels/opentrons-engine.js",
        "topic": "studio_lab_automation",
        "surface": "studio",
        "summary": "Expone automatizacion de laboratorio asociada a Opentrons dentro del Studio para que los workflows lleguen mas cerca de la ejecucion experimental.",
        "when_to_use": "cuando el flujo ya toca automatizacion de laboratorio y necesitas una superficie vinculada a robots tipo OT-2",
        "user_question": "Si quiero llevar parte del flujo a automatizacion de laboratorio, donde empiezo en SynBio Studio?",
        "user_answer": "Empieza por Opentrons Engine, que es la superficie del Studio orientada a esa capa de automatizacion.",
        "first_checks": ["que la expectativa del usuario sea automatizacion y no simulacion", "que la integracion disponible cubra el caso", "que los parametros experimentales existan"],
        "architecture_role": "Es la capa de automatizacion experimental del Studio.",
        "tags": ["opentrons", "automation", "lab", "studio"]
    },
    {
        "id": "studio-ngs-engine",
        "entity": "NGS Engine",
        "relative_path": "synbio-studio/src/panels/ngs-engine.js",
        "topic": "studio_data",
        "surface": "studio",
        "summary": "Introduce una superficie centrada en NGS para trabajar datos o procesos relacionados con secuenciacion dentro del Studio.",
        "when_to_use": "cuando el usuario necesita una puerta de entrada a flujos relacionados con secuenciacion o interpretacion NGS",
        "user_question": "El Studio toca secuenciacion o solo diseño?",
        "user_answer": "Tiene una superficie especifica para ello: NGS Engine.",
        "first_checks": ["que haya datos o workflow NGS pertinentes", "que el usuario no espere analitica inexistente", "que la carga de datos este soportada"],
        "architecture_role": "Es la capa del Studio para workflows relacionados con NGS.",
        "tags": ["ngs", "sequencing", "studio"]
    },
    {
        "id": "vscode-ai-design-assistant",
        "entity": "AI Design Assistant",
        "relative_path": "client/src/ai-design-assistant.ts",
        "topic": "vscode_ai_assistance",
        "surface": "vscode",
        "summary": "Es el asistente local de diseño en la extensión VS Code, con foco en patrones, quick fixes, hover, completions y explicaciones estructurales del circuito.",
        "when_to_use": "cuando estas dentro de la extension VS Code y quieres ayuda local sobre estructura de circuitos o asistencia de diseño",
        "user_question": "Estoy en la extension VS Code, no en el Studio. Que modulo me ayuda a diseñar y corregir circuitos?",
        "user_answer": "AI Design Assistant. Pero no hay que confundirlo con el Tutor AI del Studio: uno asiste diseño en VS Code y el otro responde dudas del producto y la arquitectura.",
        "first_checks": ["que el archivo sea BioScript", "que el usuario no espere una IA generativa universal", "que el panel y proveedores se hayan registrado"],
        "architecture_role": "Es la capa de asistencia de diseño de la extension VS Code.",
        "tags": ["vscode", "design assistant", "bioscript"]
    },
    {
        "id": "vscode-synbio-explorer",
        "entity": "SynBio Explorer",
        "relative_path": "client/src/synbio-explorer.ts",
        "topic": "vscode_navigation",
        "surface": "vscode",
        "summary": "Es la barra lateral de descubrimiento y acceso rapido de la extension VS Code, distinta del shell completo de SynBio Studio.",
        "when_to_use": "cuando trabajas dentro de VS Code y necesitas navegar herramientas, partes y accesos rapidos desde la extension",
        "user_question": "Estoy en VS Code, no en SynBio Studio. Donde encuentro la barra lateral propia del proyecto?",
        "user_answer": "En la extension, la pieza correcta es SynBio Explorer.",
        "first_checks": ["que la extension este activa", "que la vista se haya registrado", "que el usuario no la confunda con el shell Electron"],
        "architecture_role": "Es la capa de navegacion de la extension VS Code.",
        "tags": ["vscode", "explorer", "navigation"]
    },
    {
        "id": "vscode-sequence-intelligence",
        "entity": "Sequence Intelligence",
        "relative_path": "client/src/sequence-intelligence.ts",
        "topic": "vscode_editor",
        "surface": "vscode",
        "summary": "Agrupa funciones de analisis de secuencia del lado extension y las acerca al flujo del editor en VS Code.",
        "when_to_use": "cuando quieres analisis de secuencia dentro del editor y no en un panel del Studio",
        "user_question": "Quiero analizar secuencias sin salir del editor de VS Code. Que modulo lleva eso?",
        "user_answer": "Sequence Intelligence es el modulo de la extension para ese tipo de trabajo.",
        "first_checks": ["que el texto o seleccion sea apropiado", "que el usuario no lo confunda con Python API del Studio", "que el comando correcto este registrado"],
        "architecture_role": "Es una capacidad de analisis integrada en la extension VS Code.",
        "tags": ["vscode", "sequence", "analysis"]
    },
    {
        "id": "vscode-circuit-failure-predictor",
        "entity": "Circuit Failure Predictor",
        "relative_path": "client/src/circuit-failure-predictor.ts",
        "topic": "vscode_ai_assistance",
        "surface": "vscode",
        "summary": "Se centra en predecir fallos o riesgos de circuitos desde la extension, ayudando a revisar diseños antes de seguir avanzando.",
        "when_to_use": "cuando quieres identificar puntos de fallo previsibles en un circuito desde el flujo del editor",
        "user_question": "Tengo miedo de que el circuito falle. Hay algo en la extension que me ayude a prever problemas?",
        "user_answer": "Si. Circuit Failure Predictor es la pieza pensada para anticipar fallos y riesgos de diseño en la extension.",
        "first_checks": ["que el documento actual represente un circuito analizable", "que el usuario no tome la prediccion como verdad absoluta", "que el modulo este activado"],
        "architecture_role": "Es una capa de apoyo predictivo del lado de la extension.",
        "tags": ["vscode", "failure predictor", "design review"]
    },
    {
        "id": "vscode-biosecurity-scanner",
        "entity": "Biosecurity Scanner",
        "relative_path": "client/src/biosecurity-scanner.ts",
        "topic": "vscode_biosafety",
        "surface": "vscode",
        "summary": "Lleva checks de bioseguridad al flujo de la extension, donde el usuario puede escanear diseños y secuencias sin salir de VS Code.",
        "when_to_use": "cuando quieres revisar seguridad desde el editor y no desde el shell completo del Studio",
        "user_question": "Estoy en la extension. Donde escaneo bioseguridad sin abrir SynBio Studio?",
        "user_answer": "El modulo correcto es Biosecurity Scanner en la extension VS Code.",
        "first_checks": ["que el usuario no confunda el scanner con el clasificador BSL", "que la entrada tenga contexto biologico", "que las reglas cargadas correspondan al caso"],
        "architecture_role": "Es la superficie de escaneo de bioseguridad de la extension.",
        "tags": ["vscode", "biosecurity", "scanner"]
    },
    {
        "id": "backend-python-engine-server",
        "entity": "Python Engine Server",
        "relative_path": "python-engine/server.py",
        "topic": "backend_python_engine",
        "surface": "backend",
        "summary": "Es el backend local que concentra endpoints cientificos y de machine learning para SynBio-LLVM y SynBio Studio.",
        "when_to_use": "cuando el producto necesita calculo cientifico local, modelos, predicciones o APIs internas",
        "user_question": "Que es exactamente el Python Engine y por que tantas cosas dependen de el?",
        "user_answer": "Porque actua como backend local del producto para simulacion, modelos ML y endpoints cientificos. Muchas superficies del Studio y de la extension delegan en el.",
        "first_checks": ["que responda en localhost 8765", "que el venv tenga dependencias correctas", "que el endpoint solicitado exista"],
        "architecture_role": "Es el backend computacional local compartido por las superficies del producto.",
        "tags": ["backend", "python engine", "fastapi"]
    },
]


QUESTION_BUILDERS: List[Dict[str, Any]] = [
    {
        "suffix": "overview",
        "intent": "manual_overview",
        "question": "What does {entity} do?",
        "answer": "{summary} It belongs to the {surface_label} surface of the product and should be treated as a named capability rather than as an invisible implementation detail.",
    },
    {
        "suffix": "when-to-use",
        "intent": "manual_usage",
        "question": "When should I use {entity}?",
        "answer": "Use {entity} {when_to_use}. This matters because the product contains many panels and modules, and the user often needs help choosing the right surface rather than more generic explanation.",
    },
    {
        "suffix": "real-user",
        "intent": "manual_user_question",
        "question": "{user_question}",
        "answer": "{user_answer} {summary}",
    },
    {
        "suffix": "troubleshooting",
        "intent": "manual_troubleshooting",
        "question": "If {entity} is not working, what should I check first?",
        "answer": "Start with the first checks that usually break the flow: {first_checks_sentence}. {summary} In this product, many failures come from missing context, panel routing, or backend state rather than from a single algorithmic defect.",
    },
    {
        "suffix": "architecture",
        "intent": "manual_architecture",
        "question": "How does {entity} fit into the architecture?",
        "answer": "{architecture_role} It is implemented at {relative_path}, which is why the tutor should explain it with product context instead of treating it like a detached code snippet.",
    },
]


def _surface_label(surface: str) -> str:
    return {
        "studio": "SynBio Studio",
        "vscode": "VS Code extension",
        "backend": "backend",
    }.get(surface, "product")


def build_curated_entries() -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for module in CURATED_MODULES:
        first_checks_sentence = ", ".join(module["first_checks"])
        for blueprint in QUESTION_BUILDERS:
            question = blueprint["question"].format(**module)
            answer = blueprint["answer"].format(
                **module,
                surface_label=_surface_label(module["surface"]),
                first_checks_sentence=first_checks_sentence,
            )
            entry_id = f"{module['id']}-{blueprint['suffix']}"
            entries.append({
                "id": entry_id,
                "intent": blueprint["intent"],
                "topic": module["topic"],
                "audience": "all" if module["surface"] == "studio" else "intermediate",
                "question": question,
                "answer": answer,
                "tags": module["tags"] + [module["topic"], module["surface"], module["entity"].lower()],
                "variations": [
                    module["entity"],
                    f"{module['entity']} synbio studio" if module["surface"] == "studio" else f"{module['entity']} vscode",
                    f"how does {module['entity'].lower()} work",
                    module["user_question"],
                ],
                "sources": [{
                    "path": module["relative_path"],
                    "line_start": 1,
                    "line_end": 80,
                }],
            })
    return entries
