package derive

import (
	"bytes"
	"compress/zlib"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/ethereum-optimism/optimism/op-node/rollup"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/rlp"
)

type ChannelOut struct {
	id ChannelID
	// Frame ID of the next frame to emit. Increment after emitting
	frame uint64
	// How much we've pulled from the reader so far
	offset uint64
	// scratch for temporary buffering
	scratch bytes.Buffer

	// Compressor stage. Write input data to it
	compress *zlib.Writer
	// post compression buffer
	buf bytes.Buffer

	closed bool
}

func (co *ChannelOut) ID() string {
	return co.id.String()
}

func NewChannelOut() (*ChannelOut, error) {
	c := &ChannelOut{
		id: ChannelID{
			Time: uint64(time.Now().Unix()),
		},
		frame:  0,
		offset: 0,
	}
	_, err := rand.Read(c.id.Data[:])
	if err != nil {
		return nil, err
	}

	compress, err := zlib.NewWriterLevel(&c.buf, zlib.BestCompression)
	if err != nil {
		return nil, err
	}
	c.compress = compress

	return c, nil
}

func (co *ChannelOut) AddBlock(block *types.Block) error {
	if co.closed {
		return errors.New("already closed")
	}
	return blockToBatch(block, co.compress)
}

func makeUVarint(x uint64) []byte {
	var tmp [binary.MaxVarintLen64]byte
	n := binary.PutUvarint(tmp[:], x)
	return tmp[:n]
}

func (co *ChannelOut) ReadyBytes() int {
	return co.buf.Len()
}

func (co *ChannelOut) Flush() error {
	return co.compress.Flush()
}

func (co *ChannelOut) Close() error {
	if co.closed {
		return errors.New("already closed")
	}
	co.closed = true
	return co.compress.Close()
}

// OutputFrame writes a frame to w with a given max size
// Use `ReadyBytes`, `Flush`, and `Close` to modify the ready buffer.
func (co *ChannelOut) OutputFrame(w *bytes.Buffer, maxSize uint64) error {
	w.Write(co.id.Data[:])
	w.Write(makeUVarint(co.id.Time))
	w.Write(makeUVarint(co.frame))

	// +1 for single byte of frame content, +1 for lastFrame bool
	if uint64(w.Len())+2 > maxSize {
		return fmt.Errorf("no more space: %d > %d", w.Len(), maxSize)
	}

	remaining := maxSize - uint64(w.Len())
	maxFrameLen := remaining - 1 // -1 for the bool at the end
	// estimate how many bytes we lose with encoding the length of the frame
	// by encoding the max length (larger uvarints take more space)
	maxFrameLen -= uint64(len(makeUVarint(maxFrameLen)))

	// Pull the data into a temporary buffer b/c we use uvarints to record the length
	// Could theoretically use the min of co.buf.Len() & maxFrameLen
	co.scratch.Reset()
	_, err := io.CopyN(&co.scratch, &co.buf, int64(maxFrameLen))
	if err != nil && err != io.EOF {
		return err
	}
	frameLen := uint64(co.scratch.Len())
	co.offset += frameLen
	w.Write(makeUVarint(frameLen))
	w.ReadFrom(&co.scratch)
	// Only mark as closed if the channel is closed & there is no more data available
	if co.closed && err == io.EOF {
		w.WriteByte(1)
	} else {
		w.WriteByte(0)
	}
	co.frame += 1
	return nil
}

// blockToBatch writes the raw block bytes (after batch encoding) to the writer
func blockToBatch(block *types.Block, w io.Writer) error {
	var opaqueTxs []hexutil.Bytes
	for _, tx := range block.Transactions() {
		if tx.Type() == types.DepositTxType {
			continue
		}
		otx, err := tx.MarshalBinary()
		if err != nil {
			return err // TODO: wrap err
		}
		opaqueTxs = append(opaqueTxs, otx)
	}
	l1InfoTx := block.Transactions()[0]
	l1Info, err := L1InfoDepositTxData(l1InfoTx.Data())
	if err != nil {
		return err // TODO: wrap err
	}

	batch := &BatchData{BatchV1{
		Epoch:        rollup.Epoch(l1Info.Number),
		Timestamp:    block.Time(),
		Transactions: opaqueTxs,
	},
	}
	return rlp.Encode(w, batch)
}