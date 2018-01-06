-- Action Formats.
-- This file specifies how to encode each action in bytes.
-- Also used to decode and verify actions and for runtime structs.

  enum resource-types is
    scene     1
    texture   2
    font      3
    sound     4
    shader    5
  end

  enum display-ops is
    stop        0
    shape       1  -- removed.
    text        2  -- removed.
    indirect    3
    dynamic     4
    geom-buf    5
    group       6
    partition   7  -- not implemented.
    transform   8
    shader      9
    viewport   10
    instance   11
    refset     12
  end

  enum action-ops is
    stop                    0
    timer-advance           1
    timer-advance-actions   2
    int-switch              3
    jump-to                 4
    read-slots              5
    spawn                   6
    type-switch             7
    hit-group               8
    update-group            9
    load-scene              10
    sound                   11
    update-layout           12
    track-mouse             13
    quit                    14
    screen-size             15
    compute-f               16
    background              17
    create-group            18
    read-file               19
    parse-json              20
    set-text                21
    get-fields              22
    each-item               23
    num-items               24
    format-text             25
    load-image              26
    create-map              27
    geom-create             28
    set-counter             29
    add-counter             30
    geom-set-verts          31
    geom-set-inds           32
    image-size              33
    set-fields              34
    if-ref                  35
    wheel-delta             36
    set-this                37
    trace                   38
    geom-set-inds-c         39
    not-ref                 40
    button-is-down          41
    button-is-up            42
    button-was-pressed      43
    create-list             44
    append-items            45
    group-each              46
    group-bounds            47
    if-num-lt               48
    if-num-le               49
    if-num-gt               50
    if-num-ge               51
    write-slots             52
    geom-line               53
    str-switch              54
    if-num-in               55
    if-num-nin              56
    if-str-eq               57
    if-str-ne               58
    compute-i               59
    destroy-inst            60
    xxxxx-61                61
    each-in-map             62
    move-frame              63
    measure-text            64
    geom-text               65
    show-mouse              66
    destroy                 67
    geom-bounds             68
    if-ref-eq               69
    if-ref-ne               70
    set-ref                 71
    transform-rect          72
    file-chooser            73
    test-mouse-button       74
    test-cursor-mode        75
    do-cmds                 76
    do-entry                77
    do-sub                  78
    queue-inst              79
    set-bounds              80
    queue-dirty             81
    -- ref sets.
    refset-create           82
    refset-add              83
    refset-remove           84
    refset-each             85
    refset-ref-in           86
    refset-size             87
    refset-get              88
    refset-queue            89
    refset-clear            90
    -- cursor.
    cursor-rects            91
    cursor-frames           92
    cursor-pos              93
    -- notify sets.
    noset-create            94
    noset-add-inst          95
    noset-remove-inst       96
    noset-run               97
    noset-clear             98
    noset-queue             99
    -- input.
    modify-menu             100
    write-file              101
    -- vectors and transforms.
    combine-tf              102
    invert-tf               103
    transform-pt            104
    un-transform-pt 105
    add-vec2 106
    sub-vec2 107
    scale-vec2 108
    normalize-vec2 109
    dot-vec2 110
    geom-copy 111
    geom-transform 112
    geom-tesselate 113
    geom-static 114
    geom-frame 115
    float-to-int 116
    int-to-float 117
    cubic-y-for-x 118
    create-rtt 119
    render-rtt 120
  end

  enum data-ops is
    null      0
    bool      1
    num       2
    int       3
    is-ref    4 alias -- >= is-ref
    str       4
    list      5
    map       6
    inst     10  -- TODO: remove support for this.
  end

  enum data-mode is
    field     0
    index     1
    key       2
    num       3
  end

  enum format-ops is
    none      0  -- for pairing with a literal at the end.
    str       1
    f32       2
    u32       3
    i32       4
  end

  enum compute-flags is
    add-mul   10000000b -- [top] add or multiply mode.
    mul-op    11000000b -- [add-mul] multiply.
    sub-div   01000000b -- [top] subtract or divide mode.
    div-op    01100000b -- [sub-div] divide.
    func-op   00100000b -- [top] function mode.
    func2-op  00110000b -- [func-mode] 2-arg function.
    put-more  00001000b -- another PUT follows (in implied PUT op)
    get-more  00000100b -- another GET follows (in implied PUT op)
  end

  enum float-ops dup uses compute-flags is
    get     0          -- no flags.
    put     0          -- no flags unless put-more or get-more.
    add     add-mul
    mul     mul-op
    sub     sub-div
    div     div-op
    mod     func2-op 0
    min     func2-op 1
    max     func2-op 2
    pow     func2-op 3
    abs     func-op 0
    ceil    func-op 1
    floor   func-op 2
    round   func-op 3
    sqrt    func-op 4
    cos     func-op 13
    sin     func-op 14
    tan     func-op 15
    neg     func-op 25
  end

  enum int-ops dup uses compute-flags is
    get     0          -- no flags.
    put     0          -- no flags unless put-more or get-more.
    add     add-mul
    mul     mul-op
    sub     sub-div
    div     div-op
    mod     func2-op 0
    min     func2-op 1
    max     func2-op 2
    abs     func-op 0
    neg     func-op 1
  end

  enum vtable-flags bits is
    dirty     0   -- upwards: notify content changed (measure contents, propagate upwards)
    rebuild   1   -- downwards: update layout, rebuild geometry, calculate invariants.
    pre-sim   2   -- do input checks, add impulses.
    collide   3   -- for each collision pair.
    update    4   -- upwards: bounds propagation (DO NOT cause child bounds to change!)
    cursor    5   -- downwards: cursor hit-test traversal.
    shown     6   -- downwards: UI panel was shown.
    hidden    7   -- downwards: UI panel was hidden.
  end

  enum image-flags bits is
    texture   0
    wrap-u    1
    wrap-v    2
    smooth    3
    mip       4
  end

-- Flow-control

  action jump-to is
    u24 to of entry
  end

  action do-sub is
    u24 entry of entry
  end

  action do-cmds is
    u24 inst of inst
    u32 entry of c-int
  end

  action do-entry is
    u24 inst of inst
    u32 tpl of tpl
    u32 entry of tpl-entry
  end

  action int-switch is
    u24 state of int
    u24 over of entry -- if no match.
    u8 ids of length
    each ids is
      u32 @ of entry
    end
  end

  action str-switch is
    u24 to of num-keys
    u32 src of str
    each-pair to is
      u32 val of entry
      u8 key of length
      text key of text-no-len
    end
  end

-- Scenes

  action background is
    u24 color of rgb
  end

  action screen-size is
    u24 to of vec2
  end

  action load-scene is
    u24 _ of zero
    u32 scene of c-int
  end

  action quit is
    u24 _ of zero
  end

  action trace is
    u24 msg of str
  end

-- Audio

  action play-sound is
    u24 channel of c-int
    u32 sound of sound-res
  end

-- Instances

  action set-this is
    u24 to of inst
  end

  action destroy is
    u24 _ of zero
  end

  action destroy-inst is
    u24 inst of inst
  end

  action queue-inst is
    u24 inst of inst
    u32 bits of vtable-flags
  end

  action type-switch is
    u24 types of length
    u32 inst of inst
    each types is
      u32 tpl of tpl
      u32 to of entry
    end
  end

  action set-bounds is
    u24 rect of rect
  end

  action move-frame is
    u24 inst of inst
    u32 L of float
    u32 B of float
    u32 R of float
    u32 T of float
    f32 lofs of c-float
    f32 bofs of c-float
    f32 rofs of c-float
    f32 tofs of c-float
  end

-- References

  action if-ref is
    u24 to of entry
    u32 src of any-ref
  end

  action not-ref is
    u24 to of entry
    u32 src of any-ref
  end

  action if-ref-eq is
    u24 left of any-ref
    u32 right of any-ref tagged same-as left -- only tagged for rtv.
    u32 to of entry
  end

  action if-ref-ne is
    u24 left of any-ref
    u32 right of any-ref tagged same-as left -- only tagged for rtv.
    u32 to of entry
  end

  action set-ref is
    u24 from of any-ref
    u32 to of any-ref tagged same-as from -- runtime needs the tag to drop refs.
  end

  action clear-ref is
    u24 _ of zero
    u32 to of any-ref tagged -- runtime needs the tag to drop refs.
  end

-- Image handling

  action load-image is
    u24 path of str
    u24 to of image
    u8 flags of image-flags -- texture, wrap-u, wrap-v, smooth, mip.
  end

  action image-size is
    u24 image of image
    u32 to of vec2
  end

  action create-rtt is
    u24 to of image
    u32 width of int
    u32 height of int
  end

  action render-rtt is
    u24 to of image
    u32 scene of display
  end

-- Instance groups

  action create-group is
    u24 to of group
  end

  action update-group is
    u24 group of group
    u32 entry of c-int
  end

  action update-layout is
    u24 group of group
    u32 width of float
    u32 height of float
  end

  action group-each is
    u24 exit of entry
    u32 group of group
    u32 iter of inst
  end

  action group-bounds is
    u24 group of group
    u32 to of rect
  end

  action hit-group is
    u24 group of group
    u32 tf of tf
    u32 to of inst
  end

-- Text

  action set-text is
    u24 text of length
    u32 set of str
    text text of text-no-len
  end

  action if-str-eq is
    u24 left of str
    u32 right of str
    u32 to of entry
  end

  action if-str-ne is
    u24 left of str
    u32 right of str
    u32 to of entry
  end

-- Geometry

  action geom-create is
    u24 to of geom
    u32 verts of int
    u32 inds of int
    u32 stride of int
  end

  action geom-static is
    u24 to of geom
    u16 verts of length
    u16 inds of length
    u32 stride of count
    each verts is
      f32 @ of c-float
    end
    each inds is
      u16 @ of c-int
    end
  end

  action geom-set-verts is
    u24 to of geom
    u24 index of int
    u8 from of length
    each from is
      u32 @ of float
    end
  end

  action geom-set-inds is
    u24 to of geom
    u24 index of int
    u8 from of length
    u32 base of int
    each from is
      u32 @ of int
    end
  end

  action geom-set-inds-c is
    u24 to of geom
    u24 index of int
    u8 inds of length
    u32 base of int
    each inds is
      u16 @ of c-int
    end
  end

  action geom-line is
    u24 src of geom
    u32 to of geom
    u32 width of float
    u32 color of int
  end

  action geom-text is
    u24 to of geom
    u32 bmfont of font-res
    u32 text of str
    u32 width of int optional
    u32 tf of tf
    u32 size of vec2
  end

  action measure-text is
    u24 text of str
    u32 bmfont of font-res
    u32 width of int optional
    u32 to of vec2
  end

  action geom-bounds is
    u24 geom of geom
    u32 tf of tf
    u32 to of rect
  end

  action geom-copy is
    u24 src of geom
    u32 to of geom
  end

  action geom-transform is
    u24 geom of geom
    u32 tf of tf
  end

  action geom-tesselate is
    u24 src of geom
    u32 geom-tf of tf
    u32 tex-tf of tf
    u32 to of geom
  end

  action geom-frame is
    u24 to of geom
    u32 vofs of c-int
    u32 L of float
    u32 B of float
    u32 R of float
    u32 T of float
    f32 lofs of c-float
    f32 bofs of c-float
    f32 rofs of c-float
    f32 tofs of c-float
    f32 lins of c-float
    f32 bins of c-float
    f32 rins of c-float
    f32 tins of c-float
    f32 ltc of c-float
    f32 btc of c-float
    f32 rtc of c-float
    f32 ttc of c-float
    f32 us of c-float
    f32 vs of c-float
  end

-- Compute

  action set-counter is
    u24 counter of int
    u32 value of c-int
  end

  action add-counter is
    u24 counter of int
    u32 value of c-int
  end

-- File IO

  action read-file is
    u24 path of str
    u32 to of str
  end

  action write-file is
    u24 path of str
    u32 from of str
  end

  action file-chooser is
    u24 dir of str
    u32 events of entry
    u32 to of str
  end

-- Vectors and transforms

  action transform-rect is
    u24 from of rect
    u32 tf of tf
    u32 to of rect
  end

  action combine-tf is
    u24 left of tf
    u32 right of tf
    u32 to of tf
  end

  action invert-tf is
    u24 src of tf
    u32 to of tf
  end

  action transform-pt is
    u24 tf of tf
    u32 src of vec2
    u32 to of vec2
  end

  action un-transform-pt is
    u24 tf of tf
    u32 src of vec2
    u32 to of vec2
  end

  action add-vec2 is
    u24 left of vec2
    u32 right of vec2
    u32 to of vec2
  end

  action sub-vec2 is
    u24 left of vec2
    u32 right of vec2
    u32 to of vec2
  end

  action scale-vec2 is
    u24 left of vec2
    u32 right of float
    u32 to of vec2
  end

  action normalize-vec2 is
    u24 src of vec2
    u32 to of vec2
  end

  action dot-vec2 is
    u24 left of vec2
    u32 right of float
    u32 to of float
  end

-- Data handling

  action create-map is
    u24 set of data
  end

  action create-list is
    u24 set of data
  end

  action parse-json is
    u24 src of str
    u32 to of data
  end

  action num-items is
    u24 src of data
    u32 to of int
  end

  action each-item is
    u24 exit of entry
    u32 src of data
    u32 iter of data
  end

  action each-in-map is
    u24 exit of entry
    u32 src of data
    u32 key of str
    u32 val of data
  end

-- Ref sets

  action refset-create is
    u24 rs of refset
  end

  action refset-add is
    u24 rs of refset
    u32 inst of inst
  end

  action refset-remove is
    u24 rs of refset
    u32 inst of inst
  end

  action refset-each is
    u24 rs of refset
    u32 iter of inst
    u32 exit of entry
  end

  action refset-ref-in is
    u24 rs of refset
    u31 inst of inst with not of c-int
    u32 to of entry
  end

  action refset-size is
    u24 rs of refset
    u32 to of int
  end

  action refset-get is
    u24 rs of refset
    u32 index of int
    u32 to of inst
  end

  action refset-queue is
    u24 rs of refset
    u32 bits of vtable-flags
  end

  action refset-clear is
    u24 rs of refset
  end

-- Input actions

  action track-mouse is
    u24 pos of vec2
  end

  action test-mouse-button is
    u24 mask of c-int
    u31 to of entry with is-down of c-bool
  end

  action test-cursor-mode is
    u24 mask of c-int
    u32 to of entry
  end

  action cursor-pos is
    u24 pos of vec2
  end

  action wheel-delta is
    u24 slot of vec2
  end

  action button-is-down is
    u24 button of c-int
    u32 to of entry
  end

  action button-is-up is
    u24 button of c-int
    u32 to of entry
  end

  action button-was-pressed is
    u24 button of c-int
    u32 to of entry
  end

  action show-mouse is
    u24 show of c-bool
  end

  action cursor-rects is
    u24 rects of length
    u32 state of int
    each rects is
      u32 L of float
      u32 B of float
      u32 R of float
      u32 T of float
      f32 lofs of c-float
      f32 bofs of c-float
      f32 rofs of c-float
      f32 tofs of c-float
      u32 over of entry
      u32 out of entry optional
    end
  end

  action cursor-frames is
    u24 group of group
    u32 tf of tf optional
    u32 state of inst
  end

  action modify-menu is
    u24 menu of int
    u32 index of int
    u32 name of str
    u32 key of str
    u32 mask of int
    u32 entry of scn-entry optional
  end

-- Stop

  action stop is
    u24 _ of zero
  end

  action end-loop is
    u24 _ of one
  end

-- Still to do

  action timer-advance is
    u24 timer of timer
    u32 spans of length
    each spans is
      u32 @ of c-int
    end
  end

  action read-slots is
    u24 from as inst
    u32 tpl as tpl
    -- genCopySlots(item, thisTp, fromTp, true) -- NB. reversed (for validation)
  end

  action write-slots is
    u24 to as inst
    u32 tpl as tpl
    -- genCopySlots(item, toTp, thisTp) -- dst, src
  end

  action spawn is
    u24 group of group optional
    u32 set of inst optional
    u32 tpl as tpl
    -- genCopySlots(item, spawnTp, thisTp) -- dst, src
  end

  action format-text is
    u24 fmt of length
    u32 set of str
    each fmt is
      text text of text-u16 if-type text
      u32 slot of str with-tag format-ops.str if-type str
      u32 slot of float with-tag format-ops.f32 if-type f32
      u32 slot of int with-tag format-ops.u32 if-type u32
      u32 slot of int with-tag format-ops.i32 if-type i32
    end
  end

  action append-items is
    u24 ops of count
    u32 to of data
    each ops is
      u32 _ of zero with-tag data-ops.null if-type null
      u32 slot of int with-tag data-ops.bool if-type bool
      u32 slot of int with-tag data-ops.int if-type int
      u32 slot of float with-tag data-ops.num if-type float
      u32 slot of str with-tag data-ops.str if-type str
      u32 slot of data with-tag data-ops.list if-type list
      u32 slot of data with-tag data-ops.map if-type map
      u32 slot of inst with-tag data-ops.inst if-type inst
    end
  end

  action get-fields is
    u24 ops of length
    u32 src of data
    each ops is
      -- literal field name.
      u32 field of length tag-mapped data-ops mode tag-high-4 data-mode.field if-mode field
      -- literal index.
      u32 index of c-int tag-mapped data-ops mode tag-high-4 data-mode.index if-mode index
      -- field name from str slot.
      u32 key of str tag-mapped data-ops mode tag-high-4 data-mode.key if-mode key
      -- index from int slot.
      u32 num of int tag-mapped data-ops mode tag-high-4 data-mode.num if-mode num
      -- include a destination slot of the correct type.
      u32 set of int if-type bool
      u32 set of int if-type int
      u32 set of float if-type float
      u32 set of str if-type str
      u32 set of data if-type list
      u32 set of data if-type map
      u32 set of inst if-type inst
      -- literal field text goes last.
      text field of text-no-len if-mode field
    end
  end

  action set-fields is
    u24 ops of length
    u32 dest of data
    each ops is
      -- literal field name.
      u32 field of length tag-mapped data-ops mode tag-high-4 data-mode.field if-mode field
      -- literal index.
      u32 index of c-int tag-mapped data-ops mode tag-high-4 data-mode.index if-mode index
      -- field name from str slot.
      u32 key of str tag-mapped data-ops mode tag-high-4 data-mode.key if-mode key
      -- index from int slot.
      u32 num of int tag-mapped data-ops mode tag-high-4 data-mode.num if-mode num
      -- include a destination slot of the correct type.
      u32 src of int if-type bool
      u32 src of int if-type int
      u32 src of float if-type float
      u32 src of str if-type str
      u32 src of data if-type list
      u32 src of data if-type map
      u32 src of inst if-type inst
      -- literal field text goes last.
      text field of text-no-len if-mode field
    end
  end

-- Compute

  action if-num-lt is
    u24 left of float
    u32 right of float
    u32 to of entry
  end

  action if-num-le is
    u24 left of float
    u32 right of float
    u32 to of entry
  end

  action if-num-gt is
    u24 left of float
    u32 right of float
    u32 to of entry
  end

  action if-num-ge is
    u24 left of float
    u32 right of float
    u32 to of entry
  end

  action if-int-in is
    u24 src of int
    u32 lower of int
    u32 upper of int
    u32 to of entry
  end

  action if-int-nin is
    u24 src of int
    u32 lower of int
    u32 upper of int
    u32 to of entry
  end

  action compute-f is
    each ops is
      u32 slot of float tag-mapped float-ops op
    end
  end

  action compute-i is
    each ops is
      u32 slot of int tag-mapped int-ops op
    end
  end
