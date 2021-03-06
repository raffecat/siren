scene background 161616 camera ui mouse hide is
  slot asset-db type data name "Asset DB"
  slot image-cache type data name "Image Cache" new map
  slot part-cache type data name "Part Cache" new map
  slot layers-panel type inst name "Layers panel for spawning editors"
  slot nav-panel type inst name "Nav panel for spawning editors"
  slot tmp-tab type inst name "Temp tab for spawning and loading" public
  slot scn-data type data name "Loaded scene data"
  slot tmp-scenes type data name "List of scenes"
  slot proj-path type str name "Project directory path" text "/Users/mario/code/gtools/downfall"
  slot proj-to-load type str name "Project to load" text "downfall.tbpro"
  slot chit-to-load type inst name "Scene chit to load" public
  slot scn-id type str name "Loaded scene id" public
  slot scn-name type str name "Loaded scene name" public
  slot scn-filename type str name "Loaded scene filename" public
  slot scn-chits type group name "Loaded scene chits"
  slot next-scene-id type int name "Next unused scene id" value 1
  layer layer-1 name "UI" mode ui visible is
    frame top-bar left @frame,left,4 top @frame,top,-4 right @frame,right,-4 bottom @frame,top,-30 is
      image-frame logo asset tb-logo-1 left @frame,left,4 top @frame,top,-4
      use-frame btn-new-bg part tb-btn left logo,right,20 top @frame,top,-6 right btn-new-bg,left,26 bottom btn-new-bg,top,-26
      image-frame btn-new asset tb-ui-1 shape ic-new-doc left btn-new-bg,left,4 top btn-new-bg,top,-4
      use-frame btn-open-bg part tb-btn left btn-new-bg,right,-2 bottom btn-open-bg,top,-26 right btn-open-bg,left,26 top @frame,top,-6
      image-frame btn-open asset tb-ui-1 shape ic-open-doc left btn-open-bg,left,4 top btn-open-bg,top,-4
      use-frame btn-save-bg part tb-btn left btn-open-bg,right,-2 top @frame,top,-6 right btn-save-bg,left,26 bottom btn-save-bg,top,-26
      image-frame btn-save asset tb-ui-1 shape ic-save left btn-save-bg,left,4 top btn-save-bg,top,-6
    end
    nine-patch lpane asset tb-ui-1 shape tool-tabs left @frame,left,4 top top-bar,bottom,-4 right @frame,left,200 bottom @frame,bottom,4
    nine-patch rpanetop asset tb-ui-1 shape tool-tabs left @frame,right,-200 top top-bar,bottom,-4 right @frame,right,-4 bottom @frame,top,-250
    nine-patch rpanebot asset tb-ui-1 shape tool-tabs left rpanetop,left,0 top rpanetop,bottom,-4 right rpanetop,right bottom @frame,bottom,4
    nine-patch cpane asset tb-ui-1 shape main-tabs left lpane,right,4 top top-bar,bottom,-4 right rpanetop,left,-4 bottom @frame,bottom,4
    tab-strip lt-tabs of tb-tool-tab left lpane,left,0 top lpane,top,0 right lpane,right,0 bottom lpane,top,-19 is
      tab scenes-tab width 55 label "Scenes" spawn tb-scenes-panel
      tab assets-tab width 55 label "Assets" spawn tb-asset-panel with asset-db=asset-db, image-cache=image-cache, part-cache=part-cache
      tab parts-tab width 60 label "Prefabs"
    end
    tab-strip rt-tabs of tb-tool-tab left rpanetop,left,0 top rpanetop,top,0 right rpanetop,right,0 bottom rpanetop,top,-19 is
      tab nav-tab width 70 label "Navigator" spawn tb-nav-panel
    end
    tab-strip rb-tabs of tb-tool-tab left rpanebot,left,0 top rpanebot,top,0 right rpanebot,right,0 bottom rpanebot,top,-19 is
      tab layers-tab width 50 label "Layers" spawn tb-layers-panel
      tab nodes-tab width 50 label "Nodes"
    end
    tab-strip main-tabs of tb-main-tab left cpane,left,0 top cpane,top,0 right cpane,right,0 bottom cpane,top,-20 is
    end
    frame-host lt-host panel lt-tabs.hostPanel left lpane,left,0 top lpane,top,0 right lpane,right,0 bottom lpane,bottom,0
    frame-host rt-host panel rt-tabs.hostPanel left rpanetop,left,0 top rpanetop,top,0 right rpanetop,right,0 bottom rpanetop,bottom,0
    frame-host rb-host panel rb-tabs.hostPanel left rpanebot,left,0 top rpanebot,top,0 right rpanebot,right,0 bottom rpanebot,bottom,0
    frame-host main-host panel main-tabs.hostPanel left cpane,left,0 top cpane,top,0 right cpane,right,0 bottom cpane,bottom,0
  end
  script @create name "Add editor menus and load AssetDB" is
    this-ref as self
    add-menu 1 name "File"
    add-menu-item 1,0 name "Open Project..." entry do-open-project
    add-menu-sep 1,1
    add-menu-item 1,2 name "New Scene" command key "n" entry do-new-scene
    add-menu-item 1,3 name "Open Scene..." command key "o" entry do-open-scene
    add-menu-item 1,4 name "Close Scene" command key "w" entry do-close-scene
    add-menu 2 name "Edit"
    add-menu-item 2,0 name "Undo" command key "z" entry do-undo
    add-menu-item 2,1 name "Redo" command key "Z" entry do-redo
    add-menu 3 name "View"
    add-menu-item 3,0 name "Zoom In" command key "+" entry do-zoom-in
    add-menu-item 3,1 name "Zoom Out" command key "-" entry do-zoom-out
    add-menu-item 3,2 name "Actual Size" command key "0" entry do-zoom-actual
    add-menu 4 name "Layer"
    add-menu 5 name "Tools"
    add-menu-item 5,0 name "Place" key "q" entry=do-place-tool
    add-menu-item 5,1 name "Move" key "w" entry do-move-tool
    add-menu-item 5,2 name "Rotate" key "e" entry do-rotate-tool
    add-menu-item 5,3 name "Scale" key "r" entry do-scale-tool
    add-menu 6 name "Select"
    -- Load AssetDB before the Assets tab is spawned.
    format-text "{proj-path}/assetDB.json" to filename
    read-json filename to asset-db
    format-text "{proj-path}/unpacked" as unpacked
    format-text "{proj-path}/library" as library
    write-to-data asset-db write @basedir=unpacked, @libdir=library
  end
  script @init name "Load the project on startup" is
    read-from layers-tab of tb-tool-tab read panel as layers-panel
    read-from nav-tab of tb-tool-tab read panel as nav-panel
    assert-ref layers-panel or "ASSERT: didn't get nav-panel in Scene"
    assert-ref nav-panel or "ASSERT: didn't get layers-panel in Scene"
    read-from scenes-tab of tb-tool-tab read panel as tmp-panel
    read-from tmp-panel of tb-scenes-panel read chits as scn-chits
    format-text "{proj-path}/{proj-to-load}" to scn-filename
    read-json scn-filename as scn-data
    read-from-data scn-data read scenes list as tmp-scenes
    each-data tmp-scenes as scn-it do
      add 1 to counter next-scene-id
      read-from-data scn-it read id of str as scn-id, name of str as scn-name, filename of str as scn-filename
      spawn tb-scene-chit into scn-chits with id=scn-id, name=scn-name, app=self, filename=scn-filename
      -- trace "SPAWNED a scene chit"
    end
  end
  script @presim name "Load the project on startup" is
    if key-was-pressed key 126 do
      read-from main-tabs.group of tb-tab-group read panel as tmp-panel
      do-entry do-nudge-up in tmp-panel of tb-scene-editor
    end
    if key-was-pressed key 125 do
      read-from main-tabs.group of tb-tab-group read panel as tmp-panel
      do-entry do-nudge-down in tmp-panel of tb-scene-editor
    end
    if key-was-pressed key 123 do
      read-from main-tabs.group of tb-tab-group read panel as tmp-panel
      do-entry do-nudge-left in tmp-panel of tb-scene-editor
    end
    if key-was-pressed key 124 do
      read-from main-tabs.group of tb-tab-group read panel as tmp-panel
      do-entry do-nudge-right in tmp-panel of tb-scene-editor
    end
  end
  script do-undo name "Undo" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-undo in tmp-panel of tb-scene-editor
  end
  script do-redo name "Redo" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-redo in tmp-panel of tb-scene-editor
  end
  script do-zoom-in name "Zoom In" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-zoom-in in tmp-panel of tb-scene-editor
  end
  script do-zoom-out name "Zoom Out" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-zoom-out in tmp-panel of tb-scene-editor
  end
  script do-zoom-actual name "Zoom Actual" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-zoom-actual in tmp-panel of tb-scene-editor
  end
  script do-place-tool name "Place Tool" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-place-tool in tmp-panel of tb-scene-editor
  end
  script do-move-tool name "Move Tool" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-move-tool in tmp-panel of tb-scene-editor
  end
  script do-rotate-tool name "Rotate Tool" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-rotate-tool in tmp-panel of tb-scene-editor
  end
  script do-scale-tool name "Scale Tool" is
    read-from main-tabs.group of tb-tab-group read panel as tmp-panel
    do-entry do-scale-tool in tmp-panel of tb-scene-editor
  end
  script do-open-project name "Open Project" is
    format-text "/" as dir
    choose-files dir as chosen-file is
    end
  end
  script do-open-scene name "Open Scene" is
    format-text "/" as dir
    choose-files dir as chosen-file is
      -- TODO: avoid importing the same scene twice
      -- load the scene
      read-json chosen-file to scn-data
      read-from-data scn-data read name str as scn-name
      -- spawn the scene editor and main tab
      spawn-frame tb-scene-editor as tmp-panel
      - with asset-db=asset-db, image-cache=image-cache, layers-panel=layers-panel, nav-panel=nav-panel, part-cache=part-cache, scn-data=scn-data
      spawn-frame tb-main-tab as tmp-tab into main-tabs.tabs
      - with group=main-tabs.group, label=scn-name, panel=tmp-panel
      spawn tb-scene-chit into scn-chits
      - with id=chosen-file, name=scn-name, app=self, filename=chosen-file, tab=tmp-tab
      do-entry do-activate in tmp-tab of tb-main-tab
      queue-inst self for dirty -- FIXME: update main tabs layout and rebuild the tabs (queue owner of layout)
      queue-inst lt-tabs.hostPanel for dirty -- FIXME: update the scenes panel layout (queue owner of layout)
    end
  end
  script do-close-scene name "Open Scene" is
  end
  script do-new-scene name "New Scene" is
    format-text "scene-{next-scene-id}" as scn-id
    format-text "Scene {next-scene-id}" as scn-name
    format-text "scene-{next-scene-id}" as scn-filename
    add-counter next-scene-id add 1
    spawn-frame tb-scene-editor as tmp-panel with asset-db=asset-db, image-cache=image-cache, layers-panel=layers-panel, nav-panel=nav-panel, part-cache=part-cache
    spawn-frame tb-main-tab into main-tabs.tabs as tmp-tab with group=main-tabs.group, label=scn-name, panel=tmp-panel
    spawn tb-scene-chit into scn-chits with id=scn-id, name=scn-name, app=self, filename=scn-filename, tab=tmp-tab
    do-entry do-activate in tmp-tab of tb-main-tab
    queue-inst self for dirty -- FIXME: update main tabs layout and rebuild the tabs (queue owner of layout)
    queue-inst lt-tabs.hostPanel for dirty -- FIXME: update the scenes panel layout (queue owner of layout)
  end
  script do-load-scene name "Load a scene when clicked (scn-id scn-name scn-filename)" is
    if no-inst in tmp-tab do
      format-text "{proj-path}/{scn-filename}" as scn-filename
      read-json scn-filename as scn-data
      spawn-frame tb-scene-editor as tmp-panel
      - with asset-db=asset-db, image-cache=image-cache, layers-panel=layers-panel,
      -      nav-panel=nav-panel, part-cache=part-cache, scn-data=scn-data
      spawn-frame tb-main-tab into main-tabs.tabs as tmp-tab with group=main-tabs.group, label=scn-name, panel=tmp-panel
      write-to chit-to-load of tb-scene-chit write tab=tmp-tab
      queue-inst self for dirty -- FIXME: update main tabs layout and rebuild the tabs (queue owner of layout)
    end
    do-entry do-activate in tmp-tab of tb-main-tab
  end
end
