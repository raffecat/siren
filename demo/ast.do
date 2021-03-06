cmd-set @ is
  cmd scene is
    arg background of number
    arg camera of enum with ui
    arg mouse of enum with show, hide
    block is cmds scene-cmds with layers, slots, slot-ids, str-consts, scripts
    list-of layers as layers
    list-of slots as slots
    index slot-ids on id is
      duplicate "duplicate slot id '{id}' in scene"
    end
    index scripts on id is
      duplicate "duplicate script id '{id}' in scene"
    end
    index str-consts on text is
      generate-id id from "str-{count}" not-in slot-ids -- FIXME: temp-slots
    end
    -- view-of-list public-slots from slots with public=true
  end
end

cmd-set scene-cmds is
  cmd slot add-to slot-ids, slots is
    direct id of word
    arg type of word required
    arg name of text
    arg text of text
    arg new of enum with map
    arg public of flag
    arg value of number
  end
  cmd layer add-to layers is
    block is cmds layer-cmds with frame-ids, slot-ids, str-consts, scripts add-to frames, frame-ids
    direct id of word
    arg name of text required
    arg mode of enum with ui
    arg visible of flag
    arg locked of flag
    list-of frames
    index frame-ids on id is
      duplicate "duplicate frame id '{id}' in scene"
    end
  end
  cmd script add-to scripts is
    block is cmds action-cmds with layers, slot-ids, str-consts, scripts, temp-slots add-to actions
    direct id of word alias script-id
    arg name of text required
    list-of actions
    index temp-slots on id is
      assert id not-in slot-ids or "temporary name '{id}' conflicts with a scene-slot name, in script {script-id}"
      merge-on type or "cannot re-use the temporary '{id}' with a different type, in script {script-id}"
      duplicate "cannot re-use the temporary '{id}' in script {script-id}"
    end
  end
end

cmd-set layer-cmds is
  cmd frame is
    direct id of word
    arg left of frame-anchor required
    arg top of frame-anchor required
    arg right of frame-anchor required
    arg bottom of frame-anchor required
    block is cmds layer-cmds with frame-ids, slot-ids, scripts add-to frames, frame-ids
    list-of frames
  end
  cmd image-frame is
    direct id of word
    arg asset of word required
    arg shape of word
    arg left of frame-anchor required
    arg top of frame-anchor required
  end
  cmd nine-patch is
    direct id of word
    arg asset of word required
    arg shape of word required
    arg left of frame-anchor required
    arg top of frame-anchor required
    arg right of frame-anchor required
    arg bottom of frame-anchor required
  end
  cmd frame-host is
    direct id of word
    arg panel of word required
    arg left of frame-anchor required
    arg top of frame-anchor required
    arg right of frame-anchor required
    arg bottom of frame-anchor required
  end
  cmd tab-strip is
    direct id of word
    arg of of word required
    arg left of frame-anchor required
    arg top of frame-anchor required
    arg right of frame-anchor required
    arg bottom of frame-anchor required
    block is cmds tab-strip-cmds add-to tabs
    list-of tabs
  end
  cmd use-frame is
    direct id of word
    arg part of word required
    arg left of frame-anchor required
    arg top of frame-anchor required
    arg right of frame-anchor required
    arg bottom of frame-anchor required
  end
end

cmd-set tab-strip-cmds is
  cmd tab is
    direct id of word
    arg width of number required
    arg label of text required
    arg spawn of word
    arg with of key-value-map -- required if spawn
  end
end

-- for these cmd-defs, the inner commands declare parsing steps, mostly.
-- but this is essentially what commands do already, 
-- and cmd could also support 'from [field]' and 'yield' [field-set]
-- so these are commands used to parse one argument value.
-- NB. these can [appear to] access collections visible only to the caller.

pattern menu-index is
  direct menu of number
  expect ","
  direct index of number
end

pattern frame-anchor is
  direct frame of word
  expect ","
  direct anchor of word
  expect ","
  direct ofs of number
end

pattern as-temp-inst from slot is -- not deferred
  direct id of word
  assert id not-in slot-ids or "temp-slot '{id}' cannot shadow a local slot name"
  resolve id in temp-slots as slot insert id=id, type=inst
  assert slot.type is-sym inst or "temporary '{id}' used for type 'inst' already has type '{slot.type}'"
end

pattern as-temp-str from slot is -- not deferred
  direct id of word
  assert id not-in slot-ids or "temp-slot '{id}' cannot shadow a local slot name"
  resolve id in temp-slots as slot insert id=id, type=str
  assert slot.type is-sym str or "temporary '{id}' used for type 'str' already has type '{slot.type}'"
end

pattern str-slot from slot is -- depends on slot
  direct id of word
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym str or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'str'" -- depends on slot (after slot-ids)
end

pattern int-slot from slot is -- depends on slot
  direct id of word
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym int or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'int'" -- depends on slot (after slot-ids)
end

pattern num-slot from slot is -- depends on slot
  direct id of word
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym num or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'num'" -- depends on slot (after slot-ids)
end

pattern inst-slot from slot is -- depends on slot
  direct id of word
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym inst or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'inst'" -- depends on slot (after slot-ids)
end

pattern str-ref from slot is
  match-token text one-of opts is -- local namespace for one-of.
    direct value of text
    resolve text in str-consts as slot insert text=value -- text is the index key.
  end
  match-token word one-of opts is
    direct id of word
    resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
    assert slot.type is-sym str or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'str'" -- depends on slot (after slot-ids)
  end
end

pattern inst-ref from slot is
  direct id of word
  resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
  assert slot.type is-sym inst or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'inst'" -- depends on slot (after slot-ids)
end

pattern data-ref from slot is
  direct id of word
  resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
  assert slot.type is-sym data or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'data'" -- depends on slot (after slot-ids)
end

pattern group-ref from slot is
  direct id of word
  resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
  assert slot.type is-sym group or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'group'" -- depends on slot (after slot-ids)
end

pattern read-slots-map from list is
  match-list as list is
    direct src of word
    resolve src in tpl.public-slots as src-slot
    match "as" one-of opts is
      -- it would be good if the temp-slots collection captured the constraints:
      -- assert not-in slot-ids and assert same type for id, or new temp-slot.
      -- also provide error messages for these cases in one place.
      direct dest of word
      resolve dest in temp-slots as dest-slot insert type=src-slot.type
      assert dest-slot.type is-eq src-slot.type or "local temporary '{dest}' does not match the type of the source slot '{src}' from '{tpl.id}' (local temporary is '{dest-slot.type}' vs '{src-slot.type}')"
      -- ideally the collection would already know the type (slot) to be inserted.
    end
    match "to" one-of opts is
      direct dest of word
      resolve dest in slot-ids as dest-slot
      assert dest-slot.type is-eq src-slot.type or "local slot '{dest}' does not match the type of the source slot '{src}' from '{tpl.id}' (local slot is '{dest-slot.type}' vs '{src-slot.type}')"
    end
  end
end

pattern write-slots-map from list is
  match-list as list is
    direct dest of word
    resolve dest in tpl.public-slots as dest-slot
    expect "="
    direct src of word
    resolve src in slot-ids, temp-slots as src-slot
    assert src-slot.type is-eq dest-slot.type or "destination slot '{dest}' in '{tpl.id}' does not match the type of the local slot '{src}' ('{dest-slot.type}' vs '{src-slot.type}')"
  end
end

-- for these cmd-defs, the inner commands declare arguments and resolve steps,
-- which are declarative (resolve steps are performed in topological order)

-- there's no point just parsing stuff and making Lua do the rest later;
-- collections, filtered views, merge/conflict rules, resolve-in, assertions, etc.

cmd-set action-cmds is
  cmd this-ref is
    arg as of as-temp-inst required
  end
  cmd add-menu is
    direct menu of number
    arg name of str-ref required
  end
  cmd add-menu-sep is
    direct menu of menu-index
  end
  cmd add-menu-item is
    direct menu of menu-index
    arg name of str-ref required
    arg entry of word
    arg key of text
    arg command of flag
    arg option of flag
    arg shift of flag
    resolve entry in scripts or "entry '{id}' not found in this scene"
  end
  cmd format-text is
    direct fmt of text -- TODO: of text-template
    arg as of as-temp-str unless to
    arg to of str-slot unless as
  end
  cmd read-json is
    direct filename of str-ref
    arg as of as-temp-str unless to
    arg to of str-slot unless as
  end
  cmd read-from is
    direct from of inst-ref
    arg of of tpl-ref as tpl required
    -- comma separated list of its sub-command tuples:
    arg read of read-slots-map required
  end
  cmd write-to is
    direct to of inst-ref
    arg of of tpl-ref as tpl required
    arg write of write-slots-map required -- TODO: need to resolve the pairs.
  end
  cmd read-from-data is
    direct from of data-ref
    arg read of name-as-to-map required -- TODO: need types -> write to temps or slots.
  end
  cmd write-to-data is
    direct to of data-ref
    arg write of key-value-map required -- TODO: need data types <- read from temps or slots.
  end
  cmd assert-ref is
    direct slot of inst-ref
    arg or of text required
  end
  cmd each-data is
    direct slot of data-ref
    arg as of as-temp-data required
    block do cmds action-cmds add-to actions with slot-ids, scripts, temp-slots, str-consts
    list-of actions
  end
  cmd add-counter is
    direct slot of int-slot
    arg add of number required
  end
  cmd spawn is
    direct tpl of tpl-ref
    arg into of group-ref as group
    arg as of as-temp-inst
    arg to of inst-slot
    arg with of write-slots-map as args
  end
  cmd spawn-frame is
    direct tpl of tpl-ref
    arg into of group-ref as group
    arg as of as-temp-inst
    arg to of inst-slot
    arg with of write-slots-map as args
  end
  cmd if is
    -- FIXME: modular conditions require [recursive] args from a cmd-set...
    direct condition of word
    arg key of number -- for 'key-was-pressed'
    arg in of word -- for 'no-inst'
    block do cmds action-cmds with slot-ids, scripts, temp-slots, str-consts
    list-of actions
  end
  cmd do-entry is
    direct entry of word
    arg in of inst-ref as inst
    arg of of tpl-ref as tpl
    resolve entry in tpl.scripts or "entry '{id}' not found in template '{tpl.id}'"
  end
  cmd choose-files is
    direct dir of word
    arg as of word required
    block do cmds action-cmds with slot-ids, scripts, temp-slots, str-consts
    list-of actions
  end
  cmd queue-inst is
    direct inst of word
    arg for of enum-set as bits with dirty
  end
  cmd copy-text is
    direct from of word
    arg to of word required
  end
end
